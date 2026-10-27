import 'server-only';
import { and, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { modules, quizQuestions, quizzes, reviewCards, sourceChunks, sources, unbooks } from '@/db/schema';
import type { Module, Source, Unbook } from '@/db/schema';
import { ModuleContent } from '@/lib/engine/module-content';
import { SourceError } from '@/lib/sources/errors';

export type GenerationIdentity = { sourceId: string; userId: string; unbookId: string };
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type OwnedPair = { source: Source; unbook: Unbook };
export type SourceRange = { chunkIdxFrom: number; chunkIdxTo: number };
type StoredModuleContent = ({ pending: true } | ModuleContent) & { _sourceRange: SourceRange };
const identitySchema = z.strictObject({ sourceId: z.uuid(), userId: z.uuid(), unbookId: z.uuid() });
const rangeSchema = z.object({ chunkIdxFrom: z.number().int().nonnegative(),
  chunkIdxTo: z.number().int().nonnegative() }).refine((r) => r.chunkIdxTo >= r.chunkIdxFrom);

/** Safe public boundaries never retain DB errors or user content. */
export async function safely<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    throw new SourceError(error instanceof SourceError ? error.code : 'generationUnavailable');
  }
}

export async function lockOwnedPair(tx: Transaction, ids: GenerationIdentity): Promise<OwnedPair | null> {
  if (!identitySchema.safeParse(ids).success) throw new SourceError('invalidInput');
  const [source] = await tx.select().from(sources)
    .where(and(eq(sources.id, ids.sourceId), eq(sources.userId, ids.userId))).for('update');
  if (!source) return null;
  const [unbook] = await tx.select().from(unbooks).where(and(eq(unbooks.id, ids.unbookId),
    eq(unbooks.userId, ids.userId), eq(unbooks.sourceId, ids.sourceId))).for('update');
  return unbook ? { source, unbook } : null;
}

const BLOCKED_STAGES = new Set(['deleting', 'cancelling']);
export function isBlocked(unbook: Unbook): boolean {
  return BLOCKED_STAGES.has(unbook.currentStage ?? '');
}
export function isUsable(pair: OwnedPair | null): pair is OwnedPair {
  return pair !== null && pair.source.status === 'ready' && pair.source.rightsConfirmedAt !== null &&
    !isBlocked(pair.unbook) && ['queued', 'outlining', 'generating'].includes(pair.unbook.status);
}
export function sourceRange(module: Module): SourceRange {
  const content = module.content as StoredModuleContent | null;
  const parsed = rangeSchema.safeParse(content?._sourceRange);
  if (!parsed.success) throw new SourceError('generationInvalid');
  return parsed.data;
}
export function hasContent(module: Module): boolean {
  return ModuleContent.safeParse(module.content).success;
}
/** Only this private module casts the frozen DB JSON type for pending rows. */
export function storedContent(content: StoredModuleContent): ModuleContent {
  return content as ModuleContent;
}
export async function moduleRows(tx: Transaction, unbookId: string) {
  const rows = await tx.select().from(modules).where(eq(modules.unbookId, unbookId));
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
export async function moduleChunks(tx: Transaction, sourceId: string, module: Module) {
  const range = sourceRange(module);
  const chunks = await tx.select().from(sourceChunks).where(and(eq(sourceChunks.sourceId, sourceId),
    gte(sourceChunks.idx, range.chunkIdxFrom), lte(sourceChunks.idx, range.chunkIdxTo)));
  return chunks.sort((a, b) => a.idx - b.idx);
}
export async function moduleState(tx: Transaction, module: Module) {
  const active = await tx.select().from(quizzes)
    .where(and(eq(quizzes.moduleId, module.id), eq(quizzes.isActive, true)));
  const questionCounts: number[] = [];
  for (const quiz of active) {
    const questions = await tx.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id));
    questionCounts.push(questions.length);
  }
  const cards = await tx.select().from(reviewCards).where(eq(reviewCards.moduleId, module.id));
  return { moduleId: module.id, sortOrder: module.sortOrder, hasContent: hasContent(module),
    hasQuiz: questionCounts.some((count) => count > 0), hasCards: cards.length > 0,
    questionCounts, cardCount: cards.length };
}
