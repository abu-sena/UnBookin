import 'server-only';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { modules, quizAttempts, quizQuestions, quizzes, sourceChunks, unbooks } from '@/db/schema';
import type { Module } from '@/db/schema';
import { buildGradeShortAnswerPrompt } from '@/lib/ai/prompts/grade-short-answer';
import { runStructuredTask } from '@/lib/ai/structured';
import { GradeShortAnswerResult } from '@/lib/engine/grading/schemas';
import { sourceRange } from '@/lib/generation/internal';
import { LearningError } from './errors';
import { assertIdentity, type LearningIdentity } from './identity';
import { recordShortAnswerGrade } from './store';

const inputSchema = z.strictObject({ attemptId: z.uuid(), questionId: z.uuid() });

export type GradedShortAnswer = { grade: number; correct: boolean; feedback: string };

type GradingContext = {
  questionPrompt: string;
  modelAnswer: string;
  rubric: string[];
  answer: string;
  chunks: { id: string; pageFrom: number; pageTo: number; text: string }[];
};

/**
 * E5-01 AC3: grade one stored short answer for the caller's OWN open attempt.
 * The answer and source text are only sent to the AI task; they are never logged.
 */
export async function gradeShortAnswer(
  identity: LearningIdentity,
  input: { attemptId: string; questionId: string },
): Promise<GradedShortAnswer> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  const context = await loadGradingContext(identity, parsed.data);
  try {
    const result = await runStructuredTask({
      task: 'grade_short_answer',
      schema: GradeShortAnswerResult,
      prompt: buildGradeShortAnswerPrompt({
        question: context.questionPrompt,
        modelAnswer: context.modelAnswer,
        rubric: context.rubric,
        answer: context.answer,
        chunks: context.chunks,
      }),
      userId: identity.userId,
      timeoutMs: 25_000,
      deadlineMs: 30_000,
    });
    const grade = result.data.grade;
    await recordShortAnswerGrade(identity, {
      attemptId: parsed.data.attemptId,
      questionId: parsed.data.questionId,
      grade: { grade },
    });
    return { grade, correct: grade >= 3, feedback: result.data.feedback };
  } catch (error) {
    if (error instanceof LearningError) throw error;
    throw new LearningError('gradingUnavailable');
  }
}

async function loadGradingContext(
  identity: LearningIdentity,
  ids: { attemptId: string; questionId: string },
): Promise<GradingContext> {
  const [attempt] = await db
    .select({
      quizId: quizAttempts.quizId,
      answers: quizAttempts.answers,
      moduleContent: modules.content,
      sourceId: unbooks.sourceId,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .innerJoin(modules, eq(modules.id, quizzes.moduleId))
    .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
    .where(
      and(
        eq(quizAttempts.id, ids.attemptId),
        eq(quizAttempts.userId, identity.userId),
        isNull(quizAttempts.finishedAt),
        eq(unbooks.userId, identity.userId),
        eq(unbooks.status, 'ready'),
      ),
    )
    .limit(1);
  if (!attempt) throw new LearningError('notFound');

  const [question] = await db
    .select({
      type: quizQuestions.type,
      prompt: quizQuestions.prompt,
      correct: quizQuestions.correct,
      rubric: quizQuestions.rubric,
    })
    .from(quizQuestions)
    .where(
      and(eq(quizQuestions.id, ids.questionId), eq(quizQuestions.quizId, attempt.quizId)),
    )
    .limit(1);
  if (!question || question.type !== 'short_answer') throw new LearningError('notFound');

  const stored = (attempt.answers ?? {})[ids.questionId];
  const answer =
    typeof stored === 'object' && stored !== null && typeof (stored as { text?: unknown }).text === 'string'
      ? (stored as { text: string }).text
      : '';
  if (!answer.trim()) throw new LearningError('notFound');

  if (!attempt.sourceId) throw new LearningError('notFound');
  const range = sourceRange({ content: attempt.moduleContent } as Module);
  const chunks = await db
    .select({
      id: sourceChunks.id,
      pageFrom: sourceChunks.pageFrom,
      pageTo: sourceChunks.pageTo,
      text: sourceChunks.text,
    })
    .from(sourceChunks)
    .where(
      and(
        eq(sourceChunks.sourceId, attempt.sourceId),
        gte(sourceChunks.idx, range.chunkIdxFrom),
        lte(sourceChunks.idx, range.chunkIdxTo),
      ),
    )
    .orderBy(asc(sourceChunks.idx));

  return {
    questionPrompt: question.prompt,
    modelAnswer: typeof question.correct === 'string' ? question.correct : '',
    rubric: Array.isArray(question.rubric) ? question.rubric.map(String) : [],
    answer,
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      pageFrom: chunk.pageFrom ?? 0,
      pageTo: chunk.pageTo ?? 0,
      text: chunk.text,
    })),
  };
}
