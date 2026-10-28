import 'server-only';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { moduleDomains, modules, profiles, quizQuestions, quizzes, reviewCards, unbooks,
  usageCounters } from '@/db/schema';
import { CardsResult, ModuleResult, OutlineResult, QuizResult, TaggingResult } from '@/lib/engine/generation/schemas';
import { validateCards, validateModule, validateOutline, validateQuiz } from '@/lib/engine/generation/validate';
import { getLocalMonthPeriod, resolveTimeZone } from '@/lib/billing/source-quota';
import { reconcileGame } from '@/lib/game/engine';
import { SourceError, type SourceErrorCode } from '@/lib/sources/errors';
import { allowedInterests } from './context';
import { pagesProcessed, type GenerationSection } from './sections';
import { hasContent, isBlocked, isUsable, lockOwnedPair, moduleChunks, moduleRows, moduleState,
  safely, sourceRange, storedContent, type GenerationIdentity, type Transaction } from './internal';
export type { GenerationIdentity } from './internal';

async function addUnbookCost(tx: Transaction, unbookId: string, costUsd: number | null) {
  if (costUsd === null || !Number.isFinite(costUsd) || costUsd < 0) return;
  const [row] = await tx.select().from(unbooks).where(eq(unbooks.id, unbookId));
  const current = Number(row?.costUsd);
  const base = Number.isFinite(current) && current >= 0 ? current : 0;
  await tx.update(unbooks).set({ costUsd: Math.min(base + costUsd, 999_999.999999).toFixed(6) })
    .where(eq(unbooks.id, unbookId));
}
async function advance(tx: Transaction, ids: GenerationIdentity, cost: number | null) {
  const rows = await moduleRows(tx, ids.unbookId);
  let done = 0;
  for (const row of rows) {
    const state = await moduleState(tx, row);
    done += Number(state.hasContent) + Number(state.hasQuiz) + Number(state.hasCards);
  }
  await tx.update(unbooks).set({ currentStage: 'generating',
    progressPct: 15 + Math.round(70 * done / (3 * rows.length)) }).where(eq(unbooks.id, ids.unbookId));
  await addUnbookCost(tx, ids.unbookId, cost);
}
function invalid(issues: readonly unknown[]) {
  if (issues.length) throw new SourceError('generationInvalid');
}
function parse<T>(schema: { safeParse: (input: unknown) =>
  { success: true; data: T } | { success: false } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new SourceError('generationInvalid');
  return result.data;
}

export function startOutline(ids: GenerationIdentity) {
  return safely(() => db.transaction(async (tx) => {
    if (!isUsable(await lockOwnedPair(tx, ids))) return { state: 'skip' as const, moduleCount: 0 };
    const rows = await moduleRows(tx, ids.unbookId);
    if (rows.length) return { state: 'modules' as const, moduleCount: rows.length };
    await tx.update(unbooks).set({ status: 'outlining', currentStage: 'outlining', progressPct: 5 })
      .where(eq(unbooks.id, ids.unbookId));
    return { state: 'outline' as const, moduleCount: 0 };
  }));
}

export function persistOutline(ids: GenerationIdentity, outline: OutlineResult,
  sections: GenerationSection[], cost: number | null) {
  return safely(() => db.transaction(async (tx) => {
    if (!isUsable(await lockOwnedPair(tx, ids))) return { moduleCount: 0 };
    const existing = await moduleRows(tx, ids.unbookId);
    if (existing.length) return { moduleCount: existing.length };
    const result = parse(OutlineResult, outline);
    invalid(validateOutline(result, sections.map((section) => section.id)));
    const values = result.modules.map((module, sortOrder) => {
      const selected = module.sectionIds.map((id) => sections.find((section) => section.id === id)!);
      const from = selected.flatMap((s) => s.pageFrom === null ? [] : [s.pageFrom]);
      const to = selected.flatMap((s) => s.pageTo === null ? [] : [s.pageTo]);
      return { unbookId: ids.unbookId, title: module.title, summary: module.summary, sortOrder,
        sourcePageFrom: from.length ? Math.min(...from) : null,
        sourcePageTo: to.length ? Math.max(...to) : null,
        content: storedContent({ pending: true, _sourceRange: {
          chunkIdxFrom: selected[0]!.chunkIdxFrom, chunkIdxTo: selected.at(-1)!.chunkIdxTo } }) };
    });
    await tx.insert(modules).values(values);
    await tx.update(unbooks).set({ title: result.title, bigIdea: result.bigIdea,
      moduleCount: values.length, status: 'generating', currentStage: 'generating', progressPct: 15 })
      .where(eq(unbooks.id, ids.unbookId));
    await addUnbookCost(tx, ids.unbookId, cost);
    return { moduleCount: values.length };
  }));
}

export function persistModuleContent(ids: GenerationIdentity, moduleId: string,
  module: ModuleResult, cost: number | null) {
  return safely(() => db.transaction(async (tx) => {
    if (!isUsable(await lockOwnedPair(tx, ids))) return { stored: false };
    const row = (await moduleRows(tx, ids.unbookId)).find((row) => row.id === moduleId);
    if (!row || hasContent(row)) return { stored: false };
    const result = parse(ModuleResult, module);
    const chunks = await moduleChunks(tx, ids.sourceId, row);
    invalid(validateModule(result, chunks.map((chunk) => chunk.id), {
      pageFrom: row.sourcePageFrom ?? 1, pageTo: row.sourcePageTo ?? Number.MAX_SAFE_INTEGER }));
    await tx.update(modules).set({ title: result.title, summary: result.summary,
      content: storedContent({ ...result.content, _sourceRange: sourceRange(row) }),
      estimatedMinutes: result.content.estimatedMinutes }).where(eq(modules.id, moduleId));
    await advance(tx, ids, cost);
    return { stored: true };
  }));
}

export function persistQuiz(ids: GenerationIdentity, moduleId: string, quiz: QuizResult, cost: number | null) {
  return safely(() => db.transaction(async (tx) => {
    if (!isUsable(await lockOwnedPair(tx, ids))) return { stored: false };
    const row = (await moduleRows(tx, ids.unbookId)).find((row) => row.id === moduleId);
    if (!row || !hasContent(row)) return { stored: false };
    if ((await moduleState(tx, row)).hasQuiz) return { stored: false };
    const result = parse(QuizResult, quiz);
    const chunks = await moduleChunks(tx, ids.sourceId, row);
    invalid(validateQuiz(result, chunks.map((chunk) => chunk.id)));
    // Only empty active quizzes reach this point; cascade removes partial questions.
    const active = await tx.select().from(quizzes).where(eq(quizzes.moduleId, moduleId));
    for (const partial of active.filter((quiz) => quiz.isActive)) {
      await tx.delete(quizzes).where(eq(quizzes.id, partial.id));
    }
    const [created] = await tx.insert(quizzes).values({ moduleId, version: 1, isActive: true }).returning();
    if (!created) throw new SourceError('generationUnavailable');
    await tx.insert(quizQuestions).values(result.questions.map((question, sortOrder) => ({
      quizId: created.id, sortOrder, type: question.type, bloomLevel: question.bloomLevel,
      prompt: question.prompt, explanation: question.explanation, chunkRefs: question.chunkRefs,
      options: question.type === 'short_answer' ? null : question.options,
      correct: question.type === 'short_answer' ? question.modelAnswer : question.correct,
      rubric: question.type === 'short_answer' ? question.rubric : null,
    })));
    await advance(tx, ids, cost);
    return { stored: true };
  }));
}

export function persistCards(ids: GenerationIdentity, moduleId: string, cards: CardsResult, cost: number | null) {
  return safely(() => db.transaction(async (tx) => {
    if (!isUsable(await lockOwnedPair(tx, ids))) return { stored: false };
    const row = (await moduleRows(tx, ids.unbookId)).find((row) => row.id === moduleId);
    if (!row || !hasContent(row)) return { stored: false };
    const existing = await tx.select().from(reviewCards).where(eq(reviewCards.moduleId, moduleId));
    if (existing.length) return { stored: false };
    const result = parse(CardsResult, cards);
    invalid(validateCards(result, (await moduleChunks(tx, ids.sourceId, row)).map((chunk) => chunk.id)));
    await tx.insert(reviewCards).values(result.cards.map((card) => ({ moduleId, ...card })));
    await advance(tx, ids, cost);
    return { stored: true };
  }));
}

export function persistTagging(ids: GenerationIdentity, tagging: TaggingResult) {
  return safely(() => db.transaction(async (tx) => {
    if (!isUsable(await lockOwnedPair(tx, ids))) return;
    const result = parse(TaggingResult, tagging);
    const rows = await moduleRows(tx, ids.unbookId);
    const allowed = await allowedInterests(tx, ids.userId);
    const interest = allowed.find((interest) => interest.slug === result.interestSlug);
    if (!interest) throw new SourceError('generationInvalid');
    if (rows.length) await tx.delete(moduleDomains).where(inArray(moduleDomains.moduleId, rows.map((row) => row.id)));
    const values = new Map<string, typeof moduleDomains.$inferInsert>();
    for (const mapping of result.modules) {
      const row = rows[mapping.moduleIndex];
      if (!row || interest.slug === 'general') continue;
      for (const candidate of mapping.domains) {
        const domain = interest.domains.find((domain) => domain.slug === candidate.domainSlug);
        if (domain) values.set(`${row.id}:${domain.id}`,
          { moduleId: row.id, domainId: domain.id, confidence: candidate.confidence });
      }
    }
    if (values.size) await tx.insert(moduleDomains).values([...values.values()]);
    await tx.update(unbooks).set({ interestId: interest.id, currentStage: 'tagging', progressPct: 90 })
      .where(eq(unbooks.id, ids.unbookId));
  }));
}

export function finalizeGeneration(ids: GenerationIdentity) {
  return safely(() => db.transaction(async (tx) => {
    const pair = await lockOwnedPair(tx, ids);
    if (!isUsable(pair)) return { charged: false };
    const rows = await moduleRows(tx, ids.unbookId);
    if (!rows.length) throw new SourceError('generationInvalid');
    for (const row of rows) {
      const state = await moduleState(tx, row);
      if (!state.hasContent || state.questionCounts.length !== 1 ||
          state.questionCounts[0]! < 6 || state.questionCounts[0]! > 8 ||
          state.cardCount < 5 || state.cardCount > 8) throw new SourceError('generationInvalid');
    }
    const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, ids.userId));
    const now = new Date();
    const period = getLocalMonthPeriod(now, resolveTimeZone(profile?.timezone));
    const pages = pagesProcessed(pair.source);
    await tx.update(unbooks).set({ status: 'ready', currentStage: 'ready', progressPct: 100,
      completedAt: now, moduleCount: rows.length }).where(eq(unbooks.id, ids.unbookId));
    await tx.insert(usageCounters).values({ userId: ids.userId, period, unbooksUsed: 1, pagesProcessed: pages })
      .onConflictDoUpdate({ target: [usageCounters.userId, usageCounters.period], set: {
        unbooksUsed: sql`${usageCounters.unbooksUsed} + 1`,
        pagesProcessed: sql`${usageCounters.pagesProcessed} + ${pages}`,
      } });
    // The ready transition can unlock the first-Unbook reward and Unbook badges.
    await reconcileGame(tx, ids.userId, now);
    return { charged: true };
  }));
}

export function failGeneration(ids: GenerationIdentity, code: SourceErrorCode) {
  return safely(() => db.transaction(async (tx) => {
    const pair = await lockOwnedPair(tx, ids);
    if (!pair || pair.unbook.status === 'ready' || isBlocked(pair.unbook)) return;
    // Error code belongs to the caller's safe failure event; the frozen unbook schema has no error column.
    void code;
    await tx.update(unbooks).set({ status: 'failed', currentStage: 'failed' })
      .where(eq(unbooks.id, ids.unbookId));
  }));
}
