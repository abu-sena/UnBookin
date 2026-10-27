import 'server-only';
import { and, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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
  unbooks,
} from '@/db/schema';
import { resolveTimeZone } from '@/lib/billing/source-quota';
import { awardXp, dailyRefId } from '@/lib/game/xp';
import {
  MODULE_READ,
  QUIZ_PASS,
  QUIZ_PERFECT_BONUS,
  REVIEW_DAILY,
  XP_EVENT_TYPES,
  XP_REF_TYPES,
} from '@/lib/game/xp-rules';
import { firstDueAt, localDate, scheduleCard, startOfLocalDay } from './leitner';
import { LearningError } from './errors';
import {
  assertIdentity,
  ownedReadyUnbook,
  type LearningIdentity,
  type LearningTransaction,
} from './identity';
import {
  attemptIdSchema,
  cardIdSchema,
  contentLayerSchema,
  moduleIdSchema,
  questionIdSchema,
  quizIdSchema,
  reviewResultSchema,
  saveChecklistInputSchema,
  multiSelectAnswerSchema,
  singleChoiceAnswerSchema,
  shortAnswerGradeSchema,
  shortAnswerTextSchema,
  type ChecklistState,
  type ReviewResult,
} from './schemas';
import {
  isAnswerCorrect,
  scoreAttempt,
  weakConcepts,
  type BloomLevel,
  type QuizAnswers,
} from './quiz-scoring';

/**
 * Learning mutations. Every function runs in ONE transaction scoped to the
 * session identity (never a client `userId`), validates all input with Zod and
 * throws `LearningError` codes only. XP events and stats are written through
 * `awardXp` (idempotent) inside the same transaction.
 */

const LAYER_ORDER = { eli5: 0, practitioner: 1, expert: 2 } as const;
const ACTION_DUE_DAYS = 7;

/** Persisted quiz answer shape, keyed by question id. */
export type StoredAnswer = { type: string } & Record<string, unknown>;
export type StoredAnswers = Record<string, StoredAnswer>;

async function identityTimeZone(tx: LearningTransaction, userId: string): Promise<string> {
  const [row] = await tx
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return resolveTimeZone(row?.timezone);
}

function ensureProgress(tx: LearningTransaction, userId: string, moduleId: string) {
  return tx
    .insert(moduleProgress)
    .values({ userId, moduleId })
    .onConflictDoNothing({ target: [moduleProgress.userId, moduleProgress.moduleId] });
}

/** E4-02 AC7: mark a module as reading (before `read`). */
export async function markModuleReading(
  identity: LearningIdentity,
  input: { moduleId: string },
): Promise<{ status: 'reading' }> {
  const parsed = z.strictObject({ moduleId: moduleIdSchema }).safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  return db.transaction(async (tx) => {
    await ownedReadyUnbook(tx, identity, parsed.data.moduleId);
    await ensureProgress(tx, identity.userId, parsed.data.moduleId);
    await tx
      .update(moduleProgress)
      .set({ status: 'reading' })
      .where(
        and(
          eq(moduleProgress.moduleId, parsed.data.moduleId),
          eq(moduleProgress.userId, identity.userId),
        ),
      );
    return { status: 'reading' as const };
  });
}

/** E4-02 AC7: mark a module read once, award XP once, seed the review queue. */
export async function markModuleRead(
  identity: LearningIdentity,
  input: { moduleId: string },
): Promise<{ status: 'read'; xpAwarded: boolean; cardsQueued: number }> {
  const parsed = z.strictObject({ moduleId: moduleIdSchema }).safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  return db.transaction(async (tx) => {
    const { module: moduleRow } = await ownedReadyUnbook(tx, identity, parsed.data.moduleId);
    await ensureProgress(tx, identity.userId, moduleRow.id);

    const now = new Date();
    await tx
      .update(moduleProgress)
      .set({ status: 'read', readAt: now })
      .where(
        and(
          eq(moduleProgress.moduleId, moduleRow.id),
          eq(moduleProgress.userId, identity.userId),
        ),
      );

    const xp = await awardXp(tx, {
      userId: identity.userId,
      type: XP_EVENT_TYPES.MODULE_READ,
      amount: MODULE_READ,
      refType: XP_REF_TYPES.MODULE,
      refId: moduleRow.id,
    });

    const cards = await tx
      .select({ id: reviewCards.id })
      .from(reviewCards)
      .where(eq(reviewCards.moduleId, moduleRow.id));

    if (cards.length) {
      const timeZone = await identityTimeZone(tx, identity.userId);
      const dueAt = firstDueAt(now, timeZone);
      await tx
        .insert(cardStates)
        .values(cards.map((card) => ({ userId: identity.userId, cardId: card.id, box: 0, dueAt })))
        .onConflictDoNothing({ target: [cardStates.userId, cardStates.cardId] });
    }

    return { status: 'read' as const, xpAwarded: xp.awarded, cardsQueued: cards.length };
  });
}

/** E4-02 AC2: the deepest layer opened only ever increases. */
export async function recordDeepestLayer(
  identity: LearningIdentity,
  input: { moduleId: string; layer: 'eli5' | 'practitioner' | 'expert' },
): Promise<{ deepestLayer: 'eli5' | 'practitioner' | 'expert' }> {
  const parsed = z
    .strictObject({ moduleId: moduleIdSchema, layer: contentLayerSchema })
    .safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  return db.transaction(async (tx) => {
    const { module: moduleRow } = await ownedReadyUnbook(tx, identity, parsed.data.moduleId);
    await ensureProgress(tx, identity.userId, moduleRow.id);

    const [progress] = await tx
      .select({ deepestLayer: moduleProgress.deepestLayer })
      .from(moduleProgress)
      .where(
        and(
          eq(moduleProgress.moduleId, moduleRow.id),
          eq(moduleProgress.userId, identity.userId),
        ),
      )
      .for('update')
      .limit(1);
    const current = progress?.deepestLayer ?? 'eli5';
    const next =
      LAYER_ORDER[parsed.data.layer] > LAYER_ORDER[current] ? parsed.data.layer : current;
    if (next !== current) {
      await tx
        .update(moduleProgress)
        .set({ deepestLayer: next })
        .where(
          and(
            eq(moduleProgress.moduleId, moduleRow.id),
            eq(moduleProgress.userId, identity.userId),
          ),
        );
    }
    return { deepestLayer: next };
  });
}

/** E4-02 AC5: persist checked checklist items for one tool of the module. */
export async function saveChecklist(
  identity: LearningIdentity,
  input: { moduleId: string; toolIndex: number; checkedIndices: number[] },
): Promise<{ checklist: ChecklistState }> {
  const parsed = saveChecklistInputSchema.safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  return db.transaction(async (tx) => {
    const { module: moduleRow } = await ownedReadyUnbook(tx, identity, parsed.data.moduleId);
    const content = moduleRow.content;
    const tool = content?.application?.tools?.[parsed.data.toolIndex];
    if (!Array.isArray(tool?.items)) throw new LearningError('invalidInput');
    const itemCount = tool.items.length;
    if (parsed.data.checkedIndices.some((index) => index >= itemCount)) {
      throw new LearningError('invalidInput');
    }

    await ensureProgress(tx, identity.userId, moduleRow.id);
    const [progress] = await tx
      .select({ checklist: moduleProgress.checklist })
      .from(moduleProgress)
      .where(
        and(
          eq(moduleProgress.moduleId, moduleRow.id),
          eq(moduleProgress.userId, identity.userId),
        ),
      )
      .for('update')
      .limit(1);

    const checklist: ChecklistState = { ...(progress?.checklist ?? {}) };
    checklist[String(parsed.data.toolIndex)] = [...parsed.data.checkedIndices].sort(
      (a, b) => a - b,
    );

    await tx
      .update(moduleProgress)
      .set({ checklist })
      .where(
        and(
          eq(moduleProgress.moduleId, moduleRow.id),
          eq(moduleProgress.userId, identity.userId),
        ),
      );
    return { checklist };
  });
}

/** E4-02 AC5: create the weekly action from `application.actionThisWeek`. */
export async function createActionFromModule(
  identity: LearningIdentity,
  input: { moduleId: string },
): Promise<{ actionId: string; created: boolean; dueAt: Date }> {
  const parsed = z.strictObject({ moduleId: moduleIdSchema }).safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  return db.transaction(async (tx) => {
    const { module: moduleRow } = await ownedReadyUnbook(tx, identity, parsed.data.moduleId);

    const [existing] = await tx
      .select({ id: actions.id, dueAt: actions.dueAt })
      .from(actions)
      .where(
        and(
          eq(actions.moduleId, moduleRow.id),
          eq(actions.userId, identity.userId),
          eq(actions.status, 'planned'),
        ),
      )
      .limit(1);
    if (existing) return { actionId: existing.id, created: false, dueAt: existing.dueAt! };

    const plan = moduleRow.content?.application?.actionThisWeek;
    if (!plan) throw new LearningError('notFound');
    const dueAt = new Date(Date.now() + ACTION_DUE_DAYS * 24 * 60 * 60 * 1000);
    const description = [...plan.steps, plan.doneWhen].join('\n');
    const [created] = await tx
      .insert(actions)
      .values({
        userId: identity.userId,
        moduleId: moduleRow.id,
        title: plan.title,
        description,
        dueAt,
      })
      .returning({ id: actions.id, dueAt: actions.dueAt });
    if (!created) throw new LearningError('failed');
    return { actionId: created.id, created: true, dueAt: created.dueAt! };
  });
}

/** E5-01 AC1: start (or resume) the active quiz for a module. */
export async function startQuizAttempt(
  identity: LearningIdentity,
  input: { quizId: string },
): Promise<{ attemptId: string; resumed: boolean }> {
  const parsed = z.strictObject({ quizId: quizIdSchema }).safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  return db.transaction(async (tx) => {
    const owner = alias(unbooks, 'owner');
    const [quiz] = await tx
      .select({ id: quizzes.id })
      .from(quizzes)
      .innerJoin(modules, eq(modules.id, quizzes.moduleId))
      .innerJoin(owner, eq(owner.id, modules.unbookId))
      .where(
        and(
          eq(quizzes.id, parsed.data.quizId),
          eq(quizzes.isActive, true),
          eq(owner.userId, identity.userId),
          eq(owner.status, 'ready'),
        ),
      )
      .limit(1);
    if (!quiz) throw new LearningError('notFound');

    const [open] = await tx
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, quiz.id),
          eq(quizAttempts.userId, identity.userId),
          isNull(quizAttempts.finishedAt),
        ),
      )
      .limit(1);
    if (open) return { attemptId: open.id, resumed: true };

    const [created] = await tx
      .insert(quizAttempts)
      .values({ userId: identity.userId, quizId: quiz.id, answers: {} })
      .returning({ id: quizAttempts.id });
    if (!created) throw new LearningError('failed');
    return { attemptId: created.id, resumed: false };
  });
}

export type AnswerFeedback =
  | {
      kind: 'graded';
      correct: boolean;
      explanation: string;
      chunkRefs: string[];
      correctAnswer: unknown;
    }
  | { kind: 'selfGraded'; needsGrading: true; modelAnswer: string; rubric: string[] };

const singleAnswerSchema = z.union([
  singleChoiceAnswerSchema,
  z.strictObject({ index: singleChoiceAnswerSchema }),
]);
const multiAnswerSchema = z.union([
  multiSelectAnswerSchema,
  z.strictObject({ indexes: multiSelectAnswerSchema }),
]);

/** E5-01 AC2/AC3: store one answer and return immediate feedback. */
export async function recordQuizAnswer(
  identity: LearningIdentity,
  input: { attemptId: string; questionId: string; answer: unknown },
): Promise<AnswerFeedback & { correct?: boolean }> {
  const parsed = z
    // `answer` is validated per question type below, once the question is known.
    .strictObject({ attemptId: attemptIdSchema, questionId: questionIdSchema, answer: z.unknown() })
    .safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  return db.transaction(async (tx) => {
    const attempt = await ownedOpenAttempt(tx, identity, parsed.data.attemptId);
    const [question] = await tx
      .select()
      .from(quizQuestions)
      .where(
        and(eq(quizQuestions.id, parsed.data.questionId), eq(quizQuestions.quizId, attempt.quizId)),
      )
      .limit(1);
    if (!question) throw new LearningError('notFound');

    const answers: StoredAnswers = { ...(attempt.answers as StoredAnswers) };
    let feedback: AnswerFeedback;
    switch (question.type) {
      case 'mcq':
      case 'case_mcq': {
        const choice = singleAnswerSchema.safeParse(input.answer);
        if (!choice.success) throw new LearningError('invalidInput');
        const index =
          typeof choice.data === 'number' ? choice.data : (choice.data as { index: number }).index;
        answers[question.id] = { type: question.type, index };
        feedback = {
          kind: 'graded',
          correct: isAnswerCorrect(toScorable(question), answers[question.id]),
          explanation: question.explanation,
          chunkRefs: [...question.chunkRefs],
          correctAnswer: question.correct,
        };
        break;
      }
      case 'multi_select': {
        const selection = multiAnswerSchema.safeParse(input.answer);
        if (!selection.success) throw new LearningError('invalidInput');
        const indexes =
          Array.isArray(selection.data) ? selection.data : (selection.data as { indexes: number[] }).indexes;
        answers[question.id] = { type: question.type, indexes };
        feedback = {
          kind: 'graded',
          correct: isAnswerCorrect(toScorable(question), answers[question.id]),
          explanation: question.explanation,
          chunkRefs: [...question.chunkRefs],
          correctAnswer: question.correct,
        };
        break;
      }
      case 'short_answer': {
        const text = shortAnswerTextSchema.safeParse(input.answer);
        if (!text.success) throw new LearningError('invalidInput');
        answers[question.id] = { type: question.type, text: text.data };
        feedback = {
          kind: 'selfGraded',
          needsGrading: true,
          modelAnswer: typeof question.correct === 'string' ? question.correct : '',
          rubric: Array.isArray(question.rubric) ? question.rubric.map(String) : [],
        };
        break;
      }
      default:
        throw new LearningError('invalidInput');
    }

    await tx
      .update(quizAttempts)
      .set({ answers })
      .where(eq(quizAttempts.id, attempt.id));
    return feedback;
  });
}

/** Wave-2 hook: grade a stored `short_answer` (AI or self-graded). */
export async function recordShortAnswerGrade(
  identity: LearningIdentity,
  input: { attemptId: string; questionId: string; grade: unknown },
): Promise<{ graded: true }> {
  const parsed = z
    .strictObject({ attemptId: attemptIdSchema, questionId: questionIdSchema, grade: z.unknown() })
    .safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  const grade = shortAnswerGradeSchema.safeParse(parsed.data.grade);
  if (!grade.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  return db.transaction(async (tx) => {
    const attempt = await ownedOpenAttempt(tx, identity, parsed.data.attemptId);
    const [question] = await tx
      .select({ id: quizQuestions.id, type: quizQuestions.type })
      .from(quizQuestions)
      .where(
        and(eq(quizQuestions.id, parsed.data.questionId), eq(quizQuestions.quizId, attempt.quizId)),
      )
      .limit(1);
    if (!question) throw new LearningError('notFound');
    if (question.type !== 'short_answer') throw new LearningError('invalidInput');

    const answers: StoredAnswers = { ...(attempt.answers as StoredAnswers) };
    const stored = answers[question.id];
    if (stored?.type !== 'short_answer') throw new LearningError('invalidInput');
    answers[question.id] = { ...stored, ...grade.data };
    await tx.update(quizAttempts).set({ answers }).where(eq(quizAttempts.id, attempt.id));
    return { graded: true as const };
  });
}

export type FinishQuizResult = {
  scorePct: number;
  passed: boolean;
  xpAwarded: boolean;
  weakConcepts: { chunkIds: string[]; bloomLevels: BloomLevel[] };
};

/** E5-01 AC5/AC6: score the attempt once; XP is once per module. */
export async function finishQuizAttempt(
  identity: LearningIdentity,
  input: { attemptId: string },
): Promise<FinishQuizResult> {
  const parsed = z.strictObject({ attemptId: attemptIdSchema }).safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  return db.transaction(async (tx) => {
    const attempt = await ownedOpenAttempt(tx, identity, parsed.data.attemptId);
    const questions = await tx
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, attempt.quizId))
      .orderBy(quizQuestions.sortOrder);
    if (!questions.length) throw new LearningError('failed');

    const answers = (attempt.answers as StoredAnswers) ?? {};
    const score = scoreAttempt(
      questions.map((question) => toScorable(question)),
      answers as QuizAnswers,
    );
    const now = new Date();
    await tx
      .update(quizAttempts)
      .set({ scorePct: score.scorePct, passed: score.passed, finishedAt: now })
      .where(eq(quizAttempts.id, attempt.id));

    let xpAwarded = false;
    if (score.passed) {
      const pass = await awardXp(tx, {
        userId: identity.userId,
        type: XP_EVENT_TYPES.QUIZ_PASS,
        amount: QUIZ_PASS,
        refType: XP_REF_TYPES.MODULE_QUIZ,
        refId: attempt.moduleId,
      });
      xpAwarded = pass.awarded;
      if (score.scorePct === 100) {
        const perfect = await awardXp(tx, {
          userId: identity.userId,
          type: XP_EVENT_TYPES.QUIZ_PERFECT_BONUS,
          amount: QUIZ_PERFECT_BONUS,
          refType: XP_REF_TYPES.MODULE_QUIZ,
          refId: attempt.moduleId,
        });
        xpAwarded = xpAwarded || perfect.awarded;
      }
    }

    return {
      scorePct: score.scorePct,
      passed: score.passed,
      xpAwarded,
      weakConcepts: score.passed
        ? { chunkIds: [], bloomLevels: [] }
        : weakConcepts(
            questions.map((question) => toScorable(question)),
            answers as QuizAnswers,
          ),
    };
  });
}

/** E6-01 AC2/AC3: rate one of the user's cards with the Leitner rules. */
export async function rateReviewCard(
  identity: LearningIdentity,
  input: { cardId: string; result: ReviewResult },
): Promise<{ box: number; dueAt: Date }> {
  const parsed = z
    .strictObject({ cardId: cardIdSchema, result: reviewResultSchema })
    .safeParse(input);
  if (!parsed.success) throw new LearningError('invalidInput');
  assertIdentity(identity);

  return db.transaction(async (tx) => {
    const timeZone = await identityTimeZone(tx, identity.userId);
    const now = new Date();
    const [state] = await tx
      .select()
      .from(cardStates)
      .where(
        and(eq(cardStates.cardId, parsed.data.cardId), eq(cardStates.userId, identity.userId)),
      )
      .for('update')
      .limit(1);
    if (!state) throw new LearningError('notFound');

    const next = scheduleCard({ box: state.box, result: parsed.data.result, now, timeZone });
    await tx
      .update(cardStates)
      .set({
        box: next.box,
        dueAt: next.dueAt,
        lastResult: parsed.data.result,
        reviewedCount: sql`${cardStates.reviewedCount} + 1`,
      })
      .where(eq(cardStates.id, state.id));
    return next;
  });
}

export type CompleteReviewResult = { xpAwarded: boolean; reviewedToday: number };

/** E6-01 AC4: daily +10 XP once per LOCAL day, only after >= 1 rating today. */
export async function completeReviewSession(
  identity: LearningIdentity,
  now: Date = new Date(),
): Promise<CompleteReviewResult> {
  assertIdentity(identity);
  return db.transaction(async (tx) => {
    const timeZone = await identityTimeZone(tx, identity.userId);
    const dayStart = localDate(now, timeZone);
    // Only cards actually rated since local midnight count; cards merely queued by
    // markModuleRead have no last_result and must not earn review XP.
    const since = startOfLocalDay(now, timeZone);
    const [reviewed] = await tx
      .select({ value: sql<number>`count(*)` })
      .from(cardStates)
      .where(
        and(
          eq(cardStates.userId, identity.userId),
          isNotNull(cardStates.lastResult),
          gte(cardStates.updatedAt, since),
        ),
      );
    const reviewedToday = Number(reviewed?.value ?? 0);
    if (reviewedToday < 1) return { xpAwarded: false, reviewedToday: 0 };

    const daily = await awardXp(tx, {
      userId: identity.userId,
      type: XP_EVENT_TYPES.REVIEW_DAILY,
      amount: REVIEW_DAILY,
      refType: XP_REF_TYPES.REVIEW,
      refId: dailyRefId(identity.userId, dayStart),
    });
    return { xpAwarded: daily.awarded, reviewedToday };
  });
}

type AttemptRow = {
  id: string;
  quizId: string;
  moduleId: string;
  answers: unknown;
};

/**
 * The caller's attempt that is still open; a finished or foreign attempt is
 * `notFound` so ids of other users cannot be probed.
 */
async function ownedOpenAttempt(
  tx: LearningTransaction,
  identity: LearningIdentity,
  attemptId: string,
): Promise<AttemptRow> {
  const [attempt] = await tx
    .select({
      id: quizAttempts.id,
      quizId: quizAttempts.quizId,
      answers: quizAttempts.answers,
      finishedAt: quizAttempts.finishedAt,
      moduleId: quizzes.moduleId,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, identity.userId)))
    .for('update', { of: quizAttempts })
    .limit(1);
  if (!attempt || attempt.finishedAt !== null) throw new LearningError('notFound');
  return {
    id: attempt.id,
    quizId: attempt.quizId,
    moduleId: attempt.moduleId,
    answers: attempt.answers,
  };
}

/** Shape a DB question row for the pure scoring helpers. */
function toScorable(question: {
  id: string;
  type: 'mcq' | 'multi_select' | 'case_mcq' | 'short_answer';
  correct: unknown;
  bloomLevel: BloomLevel;
  chunkRefs: string[];
}) {
  return {
    id: question.id,
    type: question.type,
    correct: question.correct,
    bloomLevel: question.bloomLevel,
    chunkRefs: question.chunkRefs,
  };
}
