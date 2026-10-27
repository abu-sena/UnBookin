import 'server-only';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import {
  interests,
  modules,
  profiles,
  quizQuestions,
  quizzes,
  sources,
  unbooks,
} from '@/db/schema';
import { buildQuizPrompt } from '@/lib/ai/prompts/quiz';
import { quoteData } from '@/lib/ai/prompts/shared';
import { runStructuredTask } from '@/lib/ai/structured';
import { ModuleContent } from '@/lib/engine/module-content';
import { QuizResult } from '@/lib/engine/generation/schemas';
import { validateQuiz } from '@/lib/engine/generation/validate';
import { sendQuizRegenerate } from '@/inngest/events';
import { SourceError } from '@/lib/sources/errors';
import {
  lockOwnedPair,
  moduleChunks,
  moduleRows,
  safely,
  type GenerationIdentity,
} from './internal';

const MAX_QUIZ_VERSIONS = 3;

export const quizVersionIdentitySchema = z.strictObject({
  userId: z.uuid(),
  unbookId: z.uuid(),
  sourceId: z.uuid(),
  moduleId: z.uuid(),
});
export type QuizVersionIdentity = z.infer<typeof quizVersionIdentitySchema>;

type LoadedReady = {
  status: 'ready';
  versionCount: number;
  allowedChunkIds: string[];
  quizPrompt: ReturnType<typeof buildQuizPrompt>;
};
type Loaded = LoadedReady | { status: 'skip' | 'max'; versionCount: number };

async function loadVersionInput(ids: QuizVersionIdentity): Promise<Loaded> {
  return safely(() =>
    db.transaction(async (tx) => {
      const pair = await lockOwnedPair(tx, {
        userId: ids.userId,
        unbookId: ids.unbookId,
        sourceId: ids.sourceId,
      });
      // A READY Unbook is not a generation job: only check ownership and readiness.
      if (!pair || pair.unbook.status !== 'ready' || pair.source.status !== 'ready') {
        return { status: 'skip', versionCount: 0 };
      }
      const row = (await moduleRows(tx, ids.unbookId)).find((item) => item.id === ids.moduleId);
      if (!row) return { status: 'skip', versionCount: 0 };
      const versions = await tx
        .select({ id: quizzes.id, version: quizzes.version })
        .from(quizzes)
        .where(eq(quizzes.moduleId, row.id))
        .orderBy(asc(quizzes.version));
      if (versions.length >= MAX_QUIZ_VERSIONS) {
        return { status: 'max', versionCount: versions.length };
      }
      const content = ModuleContent.safeParse(row.content);
      if (!content.success) return { status: 'skip', versionCount: versions.length };
      const chunks = await moduleChunks(tx, ids.sourceId, row);
      if (!chunks.length) return { status: 'skip', versionCount: versions.length };

      const [profile] = await tx
        .select({
          jobRole: profiles.jobRole,
          goal: profiles.goal,
          experienceLevel: profiles.experienceLevel,
        })
        .from(profiles)
        .where(eq(profiles.userId, ids.userId))
        .limit(1);
      const [interest] = pair.unbook.interestId
        ? await tx
            .select({ name: interests.name })
            .from(interests)
            .where(eq(interests.id, pair.unbook.interestId))
            .limit(1)
        : [undefined];

      const previous = versions.length
        ? await tx
            .select({ prompt: quizQuestions.prompt })
            .from(quizQuestions)
            .where(inArray(quizQuestions.quizId, versions.map((version) => version.id)))
            .orderBy(asc(quizQuestions.quizId), asc(quizQuestions.sortOrder))
        : [];
      const quizPrompt = buildQuizPrompt({
        profile: {
          jobRole: profile?.jobRole ?? '',
          goal: profile?.goal ?? '',
          experienceLevel: profile?.experienceLevel ?? 'novice',
          interest: interest?.name ?? '',
        },
        summary: {
          bigIdea: content.data.bigIdea,
          practitioner: content.data.layers.practitioner,
        },
        chunks: chunks.map((chunk) => ({
          id: chunk.id,
          pageFrom: chunk.pageFrom ?? 0,
          pageTo: chunk.pageTo ?? 0,
          text: chunk.text,
        })),
      });
      return {
        status: 'ready',
        versionCount: versions.length,
        allowedChunkIds: chunks.map((chunk) => chunk.id),
        quizPrompt: promptDifferentWords(quizPrompt, previous.map((question) => question.prompt)),
      };
    }),
  );
}

/** Ask the same quiz task for different questions, passing earlier prompts as quoted data. */
function promptDifferentWords(
  prompt: ReturnType<typeof buildQuizPrompt>,
  previousPrompts: string[],
) {
  if (!previousPrompts.length) return prompt;
  return {
    ...prompt,
    user: `${prompt.user}\nPrevious questions (quoted data, do not repeat or paraphrase): ${quoteData(
      previousPrompts.slice(0, 80),
    )}`,
  };
}

async function persistVersion(ids: QuizVersionIdentity, result: QuizResult) {
  return safely(() =>
    db.transaction(async (tx) => {
      const pair = await lockOwnedPair(tx, {
        userId: ids.userId,
        unbookId: ids.unbookId,
        sourceId: ids.sourceId,
      });
      if (!pair || pair.unbook.status !== 'ready' || pair.source.status !== 'ready') {
        return { stored: false, version: 0, versionCount: 0 };
      }
      const row = (await moduleRows(tx, ids.unbookId)).find((item) => item.id === ids.moduleId);
      if (!row) return { stored: false, version: 0, versionCount: 0 };
      const versions = await tx
        .select({ id: quizzes.id, version: quizzes.version })
        .from(quizzes)
        .where(eq(quizzes.moduleId, row.id))
        .orderBy(asc(quizzes.version));
      if (versions.length >= MAX_QUIZ_VERSIONS) {
        return { stored: false, version: 0, versionCount: versions.length };
      }
      const chunks = await moduleChunks(tx, ids.sourceId, row);
      const parsed = QuizResult.safeParse(result);
      if (!parsed.success || validateQuiz(parsed.data, chunks.map((chunk) => chunk.id)).length) {
        throw new SourceError('generationInvalid');
      }

      const nextVersion = Math.max(0, ...versions.map((version) => version.version)) + 1;
      await tx.update(quizzes).set({ isActive: false }).where(eq(quizzes.moduleId, row.id));
      const [created] = await tx
        .insert(quizzes)
        .values({ moduleId: row.id, version: nextVersion, isActive: true })
        .returning({ id: quizzes.id });
      if (!created) throw new SourceError('generationUnavailable');
      await tx.insert(quizQuestions).values(
        parsed.data.questions.map((question, sortOrder) => ({
          quizId: created.id,
          sortOrder,
          type: question.type,
          bloomLevel: question.bloomLevel,
          prompt: question.prompt,
          explanation: question.explanation,
          chunkRefs: question.chunkRefs,
          options: question.type === 'short_answer' ? null : question.options,
          correct: question.type === 'short_answer' ? question.modelAnswer : question.correct,
          rubric: question.type === 'short_answer' ? question.rubric : null,
        })),
      );
      return { stored: true, version: nextVersion, versionCount: versions.length + 1 };
    }),
  );
}

/**
 * E5-01 AC6: generate quiz version n+1 for an owned READY module (max 3).
 * One AI call, then one transaction flips the active version.
 */
export async function regenerateQuizVersion(ids: GenerationIdentity & { moduleId: string }) {
  const parsed = quizVersionIdentitySchema.safeParse(ids);
  if (!parsed.success) throw new SourceError('invalidInput');
  const loaded = await loadVersionInput(parsed.data);
  if (loaded.status !== 'ready') {
    return { status: loaded.status, version: 0, versionCount: loaded.versionCount };
  }

  const result = await runStructuredTask({
    task: 'quiz',
    schema: QuizResult,
    prompt: loaded.quizPrompt,
    userId: parsed.data.userId,
    validate: (data) => validateQuiz(data, loaded.allowedChunkIds),
    timeoutMs: 90_000,
    deadlineMs: 120_000,
  });
  const stored = await persistVersion(parsed.data, result.data);
  return {
    status: stored.stored ? ('stored' as const) : ('skip' as const),
    version: stored.version,
    versionCount: stored.versionCount,
  };
}

/** After a failed attempt: queue version n+1 only while fewer than 3 versions exist. */
export async function queueQuizVersion(
  identity: { userId: string },
  moduleId: string,
): Promise<{ queued: boolean; versionCount: number }> {
  const parsed = z
    .strictObject({ userId: z.uuid(), moduleId: z.uuid() })
    .safeParse({ userId: identity.userId, moduleId });
  if (!parsed.success) throw new SourceError('invalidInput');

  const info = await safely(() =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          moduleId: modules.id,
          unbookId: unbooks.id,
          sourceId: unbooks.sourceId,
          sourceStatus: sources.status,
        })
        .from(modules)
        .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
        .innerJoin(sources, eq(sources.id, unbooks.sourceId))
        .where(
          and(
            eq(modules.id, parsed.data.moduleId),
            eq(unbooks.userId, parsed.data.userId),
            eq(unbooks.status, 'ready'),
          ),
        )
        .limit(1);
      if (!row || !row.sourceId || row.sourceStatus !== 'ready') return null;
      const [total] = await tx
        .select({ value: count() })
        .from(quizzes)
        .where(eq(quizzes.moduleId, row.moduleId));
      return { ...row, sourceId: row.sourceId, versionCount: Number(total?.value ?? 0) };
    }),
  );
  if (!info || info.versionCount >= MAX_QUIZ_VERSIONS) {
    return { queued: false, versionCount: info?.versionCount ?? 0 };
  }

  try {
    await sendQuizRegenerate(
      {
        userId: parsed.data.userId,
        unbookId: info.unbookId,
        sourceId: info.sourceId,
        moduleId: parsed.data.moduleId,
      },
      { eventId: `quiz-regenerate:${parsed.data.moduleId}:${info.versionCount}` },
    );
    return { queued: true, versionCount: info.versionCount };
  } catch {
    // A queue failure must never break the quiz result; retry uses the active version.
    return { queued: false, versionCount: info.versionCount };
  }
}
