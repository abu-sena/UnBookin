'use server';

import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { toLearningErrorCode, type LearningResult } from './errors';
import { contentLayerSchema, moduleIdSchema, quizIdSchema, reviewResultSchema } from './schemas';

/**
 * Server Actions for the M5 learning flows (E4/E5/E6). Authentication happens
 * via `requireUser('/home')` BEFORE any try/catch (the redirect must
 * propagate), then the unknown client input is re-validated with strict Zod
 * schemas. Only safe error codes cross the boundary; the identity comes from
 * the session and is never accepted from (or exposed to) the client.
 */

/** Result type for learning mutations: safe codes only, no messages. */
type LearningMutation<T> = Promise<LearningResult<T>>;

function run<T>(operation: () => Promise<T>): LearningMutation<T> {
  return operation().then(
    (data): LearningResult<T> => ({ ok: true, ...data }),
    (error: unknown): LearningResult<T> => ({ ok: false, code: toLearningErrorCode(error) }),
  );
}

const markReadSchema = z.strictObject({ moduleId: moduleIdSchema });
const markReadingSchema = z.strictObject({ moduleId: moduleIdSchema });
const layerSchema = z.strictObject({ moduleId: moduleIdSchema, layer: contentLayerSchema });
const checklistSchema = z.strictObject({
  moduleId: moduleIdSchema,
  toolIndex: z.number().int().min(0).max(99),
  checkedIndices: z.array(z.number().int().min(0).max(200)).max(200),
});
const actionSchema = z.strictObject({ moduleId: moduleIdSchema });
const startAttemptSchema = z.strictObject({ quizId: quizIdSchema });
const answerSchema = z.strictObject({
  attemptId: z.uuid(),
  questionId: z.uuid(),
  answer: z.unknown(),
});
const gradeSchema = z.strictObject({
  attemptId: z.uuid(),
  questionId: z.uuid(),
  grade: z.unknown(),
});
const finishAttemptSchema = z.strictObject({ attemptId: z.uuid() });
const rateCardSchema = z.strictObject({ cardId: z.uuid(), result: reviewResultSchema });

/** E4-02 AC7: module is being read. */
export async function markModuleReading(
  input: unknown,
): Promise<LearningMutation<{ status: 'reading' }>> {
  const user = await requireUser('/home');
  const parsed = markReadingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const { markModuleReading: store } = await import('./store');
  return run(() => store({ userId: user.id }, parsed.data));
}

/** E4-02 AC7: module read once (+20 XP once, cards queued for tomorrow). */
export async function markModuleRead(
  input: unknown,
): Promise<LearningMutation<{ status: 'read'; xpAwarded: boolean; cardsQueued: number }>> {
  const user = await requireUser('/home');
  const parsed = markReadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const { markModuleRead: store } = await import('./store');
  return run(() => store({ userId: user.id }, parsed.data));
}

/** E4-02 AC2: record the deepest opened layer (only increases). */
export async function recordDeepestLayer(
  input: unknown,
): Promise<LearningMutation<{ deepestLayer: 'eli5' | 'practitioner' | 'expert' }>> {
  const user = await requireUser('/home');
  const parsed = layerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const { recordDeepestLayer: store } = await import('./store');
  return run(() => store({ userId: user.id }, parsed.data));
}

/** E4-02 AC5: save checked items of one tool checklist. */
export async function saveChecklist(
  input: unknown,
): Promise<LearningMutation<{ checklist: Record<string, number[]> }>> {
  const user = await requireUser('/home');
  const parsed = checklistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const { saveChecklist: store } = await import('./store');
  return run(() => store({ userId: user.id }, parsed.data));
}

/** E4-02 AC5: turn `actionThisWeek` into the user's planned action. */
export async function createActionFromModule(
  input: unknown,
): Promise<LearningMutation<{ actionId: string; created: boolean; dueAt: string }>> {
  const user = await requireUser('/home');
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const { createActionFromModule: store } = await import('./store');
  return run(async () => {
    const result = await store({ userId: user.id }, parsed.data);
    return { actionId: result.actionId, created: result.created, dueAt: result.dueAt.toISOString() };
  });
}

/** E5-01 AC1: start (or resume) the active quiz. */
export async function startQuizAttempt(
  input: unknown,
): Promise<LearningMutation<{ attemptId: string; resumed: boolean }>> {
  const user = await requireUser('/home');
  const parsed = startAttemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const { startQuizAttempt: store } = await import('./store');
  return run(() => store({ userId: user.id }, parsed.data));
}

/** E5-01 AC2/AC3: store one answer and return immediate feedback. */
export async function recordQuizAnswer(input: unknown): Promise<
  LearningMutation<{
    kind?: 'graded' | 'selfGraded';
    correct?: boolean;
    explanation?: string;
    chunkRefs?: string[];
    correctAnswer?: unknown;
    needsGrading?: boolean;
    modelAnswer?: string;
    rubric?: string[];
  }>
> {
  const user = await requireUser('/home');
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const { recordQuizAnswer: store } = await import('./store');
  return run(() => store({ userId: user.id }, parsed.data));
}

/** Wave-2 hook: store a short-answer grade (AI or self-graded). */
export async function recordShortAnswerGrade(
  input: unknown,
): Promise<LearningMutation<{ graded: true }>> {
  const user = await requireUser('/home');
  const parsed = gradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const { recordShortAnswerGrade: store } = await import('./store');
  return run(() => store({ userId: user.id }, parsed.data));
}

/** E5-01 AC5/AC6: finish and score the attempt (XP once per module). */
export async function finishQuizAttempt(input: unknown): Promise<
  LearningMutation<{
    scorePct: number;
    passed: boolean;
    xpAwarded: boolean;
    weakConcepts: { chunkIds: string[]; bloomLevels: string[] };
  }>
> {
  const user = await requireUser('/home');
  const parsed = finishAttemptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const { finishQuizAttempt: store } = await import('./store');
  return run(() => store({ userId: user.id }, parsed.data));
}

/** E6-01 AC2/AC3: rate one review card (Lupa · Ragu · Ingat). */
export async function rateReviewCard(
  input: unknown,
): Promise<LearningMutation<{ box: number; dueAt: string }>> {
  const user = await requireUser('/home');
  const parsed = rateCardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const { rateReviewCard: store } = await import('./store');
  return run(async () => {
    const result = await store({ userId: user.id }, parsed.data);
    return { box: result.box, dueAt: result.dueAt.toISOString() };
  });
}

/** E6-01 AC4: close the session; +10 XP once per local day. */
export async function completeReviewSession(): Promise<
  LearningMutation<{ xpAwarded: boolean; reviewedToday: number }>
> {
  const user = await requireUser('/home');
  const { completeReviewSession: store } = await import('./store');
  return run(() => store({ userId: user.id }));
}
