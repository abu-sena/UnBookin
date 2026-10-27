'use server';

import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { toLearningErrorCode, type LearningResult } from './errors';
import { moduleIdSchema, quizIdSchema } from './schemas';

/**
 * Server Actions for the M5 quiz flow (E5-01). Every action authenticates with
 * `requireUser()` first, then re-validates client input with strict Zod. The
 * queue for a new quiz version is best-effort and never breaks the result.
 */

type LearningMutation<T> = Promise<LearningResult<T>>;

function run<T>(operation: () => Promise<T>): LearningMutation<T> {
  return operation().then(
    (data): LearningResult<T> => ({ ok: true, ...data }),
    (error: unknown): LearningResult<T> => ({ ok: false, code: toLearningErrorCode(error) }),
  );
}

const quizResumeSchema = z.strictObject({ quizId: quizIdSchema });
const quizModuleSchema = z.strictObject({ moduleId: moduleIdSchema });
const attemptSchema = z.strictObject({ attemptId: z.uuid() });
const gradeShortAnswerSchema = z.strictObject({
  attemptId: z.uuid(),
  questionId: z.uuid(),
});

type QuizQuestions = {
  id: string;
  type: 'mcq' | 'multi_select' | 'case_mcq' | 'short_answer';
  prompt: string;
  options: unknown;
}[];

type QuizResume = {
  attemptId: string;
  quizId: string;
  questions: QuizQuestions;
  answeredQuestionIds: string[];
  resumed: boolean;
};

async function loadQuizAttempt(userId: string, quizId: string): Promise<QuizResume> {
  const { startQuizAttempt: store } = await import('./store');
  const { getAttemptStatus, getQuizForAttempt } = await import('./queries');
  const attempt = await store({ userId }, { quizId });
  const quiz = await getQuizForAttempt({ userId }, { quizId });
  const status = await getAttemptStatus({ userId }, { attemptId: attempt.attemptId });
  return {
    attemptId: attempt.attemptId,
    quizId: quiz.quizId,
    questions: quiz.questions,
    answeredQuestionIds: status.answeredQuestionIds,
    resumed: attempt.resumed,
  };
}

/** E5-01 AC1: start (or resume) the active quiz and load its answer-free questions. */
export async function resumeQuizAttempt(input: unknown): Promise<LearningMutation<QuizResume>> {
  const user = await requireUser('/home');
  const parsed = quizResumeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  return run(() => loadQuizAttempt(user.id, parsed.data.quizId));
}

/** E5-01 AC6: "Coba lagi" always starts the module's CURRENT active quiz. */
export async function startQuizForModule(input: unknown): Promise<LearningMutation<QuizResume>> {
  const user = await requireUser('/home');
  const parsed = quizModuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  return run(async () => {
    const { getModuleForReading } = await import('./queries');
    const { LearningError } = await import('./errors');
    const moduleView = await getModuleForReading({ userId: user.id }, parsed.data);
    if (!moduleView.quizId) throw new LearningError('notFound');
    return loadQuizAttempt(user.id, moduleView.quizId);
  });
}

/** E5-01 AC3: AI-grade one short answer; any AI/config failure falls back to self-grading. */
export async function gradeShortAnswer(
  input: unknown,
): Promise<LearningMutation<{ grade: number; correct: boolean; feedback: string }>> {
  const user = await requireUser('/home');
  const parsed = gradeShortAnswerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  try {
    const { gradeShortAnswer: grade } = await import('./grading');
    const result = await grade({ userId: user.id }, parsed.data);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      code: toLearningErrorCode(error) === 'invalidInput' ? 'invalidInput' : 'gradingUnavailable',
    };
  }
}

/** E5-01 AC5/AC6: finish, then queue the next version only after a failed attempt. */
export async function finishQuizAndPrepareRetry(input: unknown): Promise<
  LearningMutation<{
    scorePct: number;
    passed: boolean;
    xpAwarded: boolean;
    weakConcepts: { chunkIds: string[]; bloomLevels: string[] };
    retryVersionQueued: boolean;
  }>
> {
  const user = await requireUser('/home');
  const parsed = attemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  return run(async () => {
    const { finishQuizAttempt: store } = await import('./store');
    const result = await store({ userId: user.id }, parsed.data);
    let retryVersionQueued = false;
    if (!result.passed) {
      try {
        const { getAttemptStatus } = await import('./queries');
        const status = await getAttemptStatus(
          { userId: user.id },
          { attemptId: parsed.data.attemptId },
        );
        const { queueQuizVersion } = await import('@/lib/generation/quiz-version');
        const queued = await queueQuizVersion({ userId: user.id }, status.moduleId);
        retryVersionQueued = queued.queued;
      } catch {
        retryVersionQueued = false;
      }
    }
    return { ...result, retryVersionQueued };
  });
}
