import 'server-only';
import { and, asc, count, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import {
  actions,
  cardStates,
  moduleProgress,
  modules,
  profiles,
  quizAttempts,
  quizQuestions,
  quizzes,
  reviewCards,
  sourceChunks,
  unbooks,
} from '@/db/schema';
import { resolveTimeZone } from '@/lib/billing/source-quota';
import { startOfLocalDay } from './leitner';
import { LearningError } from './errors';
import {
  assertIdentity,
  ownedReadyUnbookRead,
  type LearningIdentity,
} from './identity';
import type { ChecklistState } from './schemas';

/**
 * Read-only learning queries. Every function takes the session identity (never
 * a client `userId`) and filters every row by that `user_id`; a module is only
 * visible when its unbook belongs to the user and is `ready`. Errors are
 * thrown as `LearningError` and mapped to safe codes by the action layer.
 */

export type PathModuleNode = {
  moduleId: string;
  title: string;
  summary: string | null;
  estimatedMinutes: number | null;
  status: 'not_started' | 'reading' | 'read';
  /** `locked` until the previous module is read; the first is always available. */
  state: 'locked' | 'available' | 'current' | 'done';
};

export type UnbookPath = {
  unbookId: string;
  title: string;
  bigIdea: string | null;
  modules: PathModuleNode[];
  modulesDone: number;
  modulesTotal: number;
  continueModuleId: string | null;
};

const unbookIdInputSchema = z.strictObject({ unbookId: z.uuid() });

/**
 * E4-01: the vertical module path. A module unlocks when the previous one is
 * `read`; the first module is always available.
 */
export async function getUnbookPath(
  identity: LearningIdentity,
  input: z.input<typeof unbookIdInputSchema>,
): Promise<UnbookPath> {
  const parsedId = unbookIdInputSchema.safeParse(input);
  if (!parsedId.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  const [unbook] = await db
    .select({ id: unbooks.id, title: unbooks.title, bigIdea: unbooks.bigIdea, status: unbooks.status })
    .from(unbooks)
    .where(and(eq(unbooks.id, parsedId.data.unbookId), eq(unbooks.userId, identity.userId)))
    .limit(1);
  if (!unbook || unbook.status !== 'ready') throw new LearningError('notFound');

  const rows = await db
    .select({
      id: modules.id,
      title: modules.title,
      summary: modules.summary,
      estimatedMinutes: modules.estimatedMinutes,
      status: moduleProgress.status,
    })
    .from(modules)
    .leftJoin(
      moduleProgress,
      and(eq(moduleProgress.moduleId, modules.id), eq(moduleProgress.userId, identity.userId)),
    )
    .where(eq(modules.unbookId, unbook.id))
    .orderBy(asc(modules.sortOrder), asc(modules.id));

  const nodes: PathModuleNode[] = rows.map((row, index) => {
    const status = row.status ?? 'not_started';
    const previousRead = index === 0 || rows[index - 1]?.status === 'read';
    const state: PathModuleNode['state'] =
      status === 'read'
        ? 'done'
        : !previousRead
          ? 'locked'
          : status === 'reading'
            ? 'current'
            : 'available';
    return {
      moduleId: row.id,
      title: row.title,
      summary: row.summary,
      estimatedMinutes: row.estimatedMinutes,
      status,
      state,
    };
  });

  const modulesDone = nodes.filter((node) => node.state === 'done').length;
  const continueNode = nodes.find((node) => node.state === 'current') ??
    nodes.find((node) => node.state === 'available') ?? null;

  return {
    unbookId: unbook.id,
    title: unbook.title,
    bigIdea: unbook.bigIdea,
    modules: nodes,
    modulesDone,
    modulesTotal: nodes.length,
    continueModuleId: continueNode?.moduleId ?? null,
  };
}

export type ModuleForReading = {
  moduleId: string;
  unbookId: string;
  title: string;
  content: Record<string, unknown>;
  status: 'not_started' | 'reading' | 'read';
  deepestLayer: 'eli5' | 'practitioner' | 'expert';
  checklist: ChecklistState;
  quizId: string | null;
  quizQuestionCount: number;
  reviewCardCount: number;
  plannedActionId: string | null;
};

const moduleIdInputSchema = z.strictObject({ moduleId: z.uuid() });

function stripSourceRange(content: unknown): Record<string, unknown> {
  if (typeof content !== 'object' || content === null) return {};
  const copy: Record<string, unknown> = { ...(content as Record<string, unknown>) };
  delete copy._sourceRange;
  return copy;
}

/** E4-02: everything the reading screen needs, without the internal `_sourceRange`. */
export async function getModuleForReading(
  identity: LearningIdentity,
  input: z.input<typeof moduleIdInputSchema>,
): Promise<ModuleForReading> {
  const parsedId = moduleIdInputSchema.safeParse(input);
  if (!parsedId.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  const { module: moduleRow } = await ownedReadyUnbookRead(identity, parsedId.data.moduleId);
  const [progress] = await db
    .select({
      status: moduleProgress.status,
      deepestLayer: moduleProgress.deepestLayer,
      checklist: moduleProgress.checklist,
    })
    .from(moduleProgress)
    .where(
      and(eq(moduleProgress.moduleId, moduleRow.id), eq(moduleProgress.userId, identity.userId)),
    )
    .limit(1);

  const [quiz] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.moduleId, moduleRow.id), eq(quizzes.isActive, true)))
    .orderBy(asc(quizzes.version))
    .limit(1);
  const [questionCount] = quiz
    ? await db
        .select({ value: count() })
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, quiz.id))
    : [];
  const [cardCount] = await db
    .select({ value: count() })
    .from(reviewCards)
    .where(eq(reviewCards.moduleId, moduleRow.id));
  const [plannedAction] = await db
    .select({ id: actions.id })
    .from(actions)
    .where(
      and(
        eq(actions.moduleId, moduleRow.id),
        eq(actions.userId, identity.userId),
        eq(actions.status, 'planned'),
      ),
    )
    .orderBy(asc(actions.createdAt))
    .limit(1);

  return {
    moduleId: moduleRow.id,
    unbookId: moduleRow.unbookId,
    title: moduleRow.title,
    content: stripSourceRange(moduleRow.content),
    status: progress?.status ?? 'not_started',
    deepestLayer: progress?.deepestLayer ?? 'eli5',
    checklist: progress?.checklist ?? {},
    quizId: quiz?.id ?? null,
    quizQuestionCount: Number(questionCount?.value ?? 0),
    reviewCardCount: Number(cardCount?.value ?? 0),
    plannedActionId: plannedAction?.id ?? null,
  };
}

export type SourceExcerpt = {
  chunkId: string;
  pageFrom: number | null;
  pageTo: number | null;
  text: string;
};

const excerptInputSchema = z.strictObject({ moduleId: z.uuid(), chunkId: z.uuid() });

/** E4-02 AC4: a short quote from the module's source, shown in a bottom sheet. */
export async function getSourceExcerpt(
  identity: LearningIdentity,
  input: z.input<typeof excerptInputSchema>,
): Promise<SourceExcerpt> {
  const parsedId = excerptInputSchema.safeParse(input);
  if (!parsedId.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  const { module: moduleRow } = await ownedReadyUnbookRead(identity, parsedId.data.moduleId);
  if (moduleRow.unbookId === null) throw new LearningError('notFound');
  const unbookId = moduleRow.unbookId;
  const [sourceId] = await db
    .select({ sourceId: unbooks.sourceId })
    .from(unbooks)
    .where(eq(unbooks.id, unbookId))
    .limit(1);
  if (!sourceId?.sourceId) throw new LearningError('notFound');

  const [chunk] = await db
    .select({
      id: sourceChunks.id,
      text: sourceChunks.text,
      pageFrom: sourceChunks.pageFrom,
      pageTo: sourceChunks.pageTo,
    })
    .from(sourceChunks)
    .where(
      and(eq(sourceChunks.id, parsedId.data.chunkId), eq(sourceChunks.sourceId, sourceId.sourceId)),
    )
    .limit(1);
  if (!chunk) throw new LearningError('notFound');

  return {
    chunkId: chunk.id,
    pageFrom: chunk.pageFrom,
    pageTo: chunk.pageTo,
    text: excerptText(chunk.text),
  };
}

/** Max 3 sentences / 400 chars, cut on the last sentence boundary. */
function excerptText(text: string): string {
  if (text.length <= 400) return text.trim();
  const cut = text.slice(0, 400);
  const sentenceEnd = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
  );
  const trimmed = sentenceEnd >= 80 ? cut.slice(0, sentenceEnd + 1) : cut;
  return `${trimmed.trimEnd()}…`;
}

export type QuizForAttempt = {
  quizId: string;
  moduleId: string;
  questions: {
    id: string;
    type: 'mcq' | 'multi_select' | 'case_mcq' | 'short_answer';
    prompt: string;
    options: unknown;
  }[];
};

const quizIdInputSchema = z.strictObject({ quizId: z.uuid() });

/** E5-01: the active quiz without `correct`, `modelAnswer` or `rubric`. */
export async function getQuizForAttempt(
  identity: LearningIdentity,
  input: z.input<typeof quizIdInputSchema>,
): Promise<QuizForAttempt> {
  const parsedId = quizIdInputSchema.safeParse(input);
  if (!parsedId.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  const [quiz] = await db
    .select({ id: quizzes.id, moduleId: quizzes.moduleId })
    .from(quizzes)
    .innerJoin(modules, eq(modules.id, quizzes.moduleId))
    .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
    .where(
      and(
        eq(quizzes.id, parsedId.data.quizId),
        eq(quizzes.isActive, true),
        eq(unbooks.userId, identity.userId),
        eq(unbooks.status, 'ready'),
      ),
    )
    .limit(1);
  if (!quiz) throw new LearningError('notFound');

  const questions = await db
    .select({
      id: quizQuestions.id,
      type: quizQuestions.type,
      prompt: quizQuestions.prompt,
      options: quizQuestions.options,
    })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(asc(quizQuestions.sortOrder), asc(quizQuestions.id));

  return {
    quizId: quiz.id,
    moduleId: quiz.moduleId,
    questions: questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options,
    })),
  };
}

export type ReviewQueueCard = {
  cardId: string;
  front: string;
  back: string;
  moduleTitle: string;
  box: number;
};

export type ReviewQueue = { cards: ReviewQueueCard[]; count: number };

const REVIEW_QUEUE_LIMIT = 20;

/** E6-01 AC2/AC4: the user's due cards, oldest first, max 20 per session. */
export async function getReviewQueue(
  identity: LearningIdentity,
  now: Date = new Date(),
): Promise<ReviewQueue> {
  assertIdentity(identity);
  const cards = await db
    .select({
      cardId: cardStates.cardId,
      front: reviewCards.front,
      back: reviewCards.back,
      moduleTitle: modules.title,
      box: cardStates.box,
    })
    .from(cardStates)
    .innerJoin(reviewCards, eq(reviewCards.id, cardStates.cardId))
    .innerJoin(modules, eq(modules.id, reviewCards.moduleId))
    .where(and(eq(cardStates.userId, identity.userId), lte(cardStates.dueAt, now)))
    .orderBy(asc(cardStates.dueAt), asc(cardStates.cardId))
    .limit(REVIEW_QUEUE_LIMIT);
  return { cards, count: cards.length };
}

/** E6-01 AC5: due card count for the Review tab badge. */
export async function countDueCards(
  identity: LearningIdentity,
  now: Date = new Date(),
): Promise<number> {
  assertIdentity(identity);
  const [row] = await db
    .select({ value: count() })
    .from(cardStates)
    .where(and(eq(cardStates.userId, identity.userId), lte(cardStates.dueAt, now)));
  return Number(row?.value ?? 0);
}

/** E5-01/E6-01: cards due at the start of tomorrow (local time). */
export async function countDueTomorrow(
  identity: LearningIdentity,
  now: Date = new Date(),
): Promise<number> {
  assertIdentity(identity);
  const timeZone = await userTimeZone(identity.userId);
  const until = startOfLocalDay(now, timeZone, 2);
  const since = startOfLocalDay(now, timeZone, 1);
  const [row] = await db
    .select({ value: count() })
    .from(cardStates)
    .where(
      and(
        eq(cardStates.userId, identity.userId),
        gte(cardStates.dueAt, since),
        lte(cardStates.dueAt, until),
      ),
    );
  return Number(row?.value ?? 0);
}

async function userTimeZone(userId: string): Promise<string> {
  const [profile] = await db
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return resolveTimeZone(profile?.timezone);
}

export type TodaySummary = {
  activeActions: { id: string; title: string; dueAt: Date | null }[];
  nextModuleId: string | null;
  nextModuleTitle: string | null;
  dueTomorrow: number;
};

/** E4-01/E7-01/E6-01: the home "Today" card data. */
export async function getTodaySummary(
  identity: LearningIdentity,
  now: Date = new Date(),
): Promise<TodaySummary> {
  assertIdentity(identity);
  const activeActions = await db
    .select({ id: actions.id, title: actions.title, dueAt: actions.dueAt })
    .from(actions)
    .where(and(eq(actions.userId, identity.userId), eq(actions.status, 'planned')))
    .orderBy(asc(actions.dueAt), asc(actions.createdAt))
    .limit(20);

  const readable = await db
    .select({
      id: modules.id,
      title: modules.title,
      sortOrder: modules.sortOrder,
      unbookId: unbooks.id,
      status: moduleProgress.status,
    })
    .from(modules)
    .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
    .leftJoin(
      moduleProgress,
      and(eq(moduleProgress.moduleId, modules.id), eq(moduleProgress.userId, identity.userId)),
    )
    .where(and(eq(unbooks.userId, identity.userId), eq(unbooks.status, 'ready')))
    .orderBy(asc(unbooks.createdAt), asc(modules.sortOrder));

  const doneIds = new Set(
    readable.filter((row) => row.status === 'read').map((row) => row.id),
  );
  const next = readable.find((row) => !doneIds.has(row.id)) ?? null;

  return {
    activeActions,
    nextModuleId: next?.id ?? null,
    nextModuleTitle: next?.title ?? null,
    dueTomorrow: await countDueTomorrow(identity, now),
  };
}

/** Kept local to this module: the attempt read joins the quiz for its module. */
export type QuizAttemptStatus = {
  attemptId: string;
  quizId: string;
  moduleId: string;
  answeredQuestionIds: string[];
  finishedAt: Date | null;
};

const attemptInputSchema = z.strictObject({ attemptId: z.uuid() });

/** E5-01: the user's attempt with which questions are already answered. */
export async function getAttemptStatus(
  identity: LearningIdentity,
  input: z.input<typeof attemptInputSchema>,
): Promise<QuizAttemptStatus> {
  const parsedId = attemptInputSchema.safeParse(input);
  if (!parsedId.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  const [attempt] = await db
    .select({
      id: quizAttempts.id,
      quizId: quizAttempts.quizId,
      answers: quizAttempts.answers,
      finishedAt: quizAttempts.finishedAt,
      moduleId: quizzes.moduleId,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(
      and(eq(quizAttempts.id, parsedId.data.attemptId), eq(quizAttempts.userId, identity.userId)),
    )
    .limit(1);
  if (!attempt) throw new LearningError('notFound');

  const answers = (attempt.answers ?? {}) as Record<string, unknown>;
  return {
    attemptId: attempt.id,
    quizId: attempt.quizId,
    moduleId: attempt.moduleId,
    answeredQuestionIds: Object.keys(answers),
    finishedAt: attempt.finishedAt,
  };
}

export type ModuleCardsOverview = { moduleId: string; cardIds: string[] };

/** All card ids of a module, ordered deterministically (used by seeding). */
export async function listModuleCardIds(
  identity: LearningIdentity,
  input: z.input<typeof moduleIdInputSchema>,
): Promise<ModuleCardsOverview> {
  const parsedId = moduleIdInputSchema.safeParse(input);
  if (!parsedId.success) throw new LearningError('invalidInput');
  assertIdentity(identity);
  const { module: moduleRow } = await ownedReadyUnbookRead(identity, parsedId.data.moduleId);
  const cards = await db
    .select({ id: reviewCards.id })
    .from(reviewCards)
    .where(eq(reviewCards.moduleId, moduleRow.id))
    .orderBy(asc(reviewCards.createdAt), asc(reviewCards.id));
  return { moduleId: moduleRow.id, cardIds: cards.map((card) => card.id) };
}
