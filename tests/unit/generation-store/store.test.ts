import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fake } from '../sources/core-fake-db';
vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: fake.db }));
vi.mock('@/lib/game/engine', () => ({ reconcileGame: vi.fn(async () => ({})) }));
import { reconcileGame } from '@/lib/game/engine';
import { moduleDomains, modules, quizzes, quizQuestions, reviewCards, sources, unbooks, usageCounters } from '@/db/schema';
import { failGeneration, finalizeGeneration, persistCards, persistModuleContent, persistOutline,
  persistQuiz, persistTagging, startOutline } from '@/lib/generation/store';
import { loadModuleInput, loadOutlineInput, loadTaggingInput, listModuleWork } from '@/lib/generation/context';
import { cards, chunkId, moduleResult, outline, quiz } from '../generation/fixtures';

const ids = { sourceId: '00000000-0000-4000-8000-000000000010',
  userId: '00000000-0000-4000-8000-000000000011', unbookId: '00000000-0000-4000-8000-000000000012' };
const source = { id: ids.sourceId, userId: ids.userId, status: 'ready', rightsConfirmedAt: new Date(),
  type: 'text', pageCount: 3, wordCount: 601, fileDeletedAt: new Date() };
const unbook = { id: ids.unbookId, userId: ids.userId, sourceId: ids.sourceId,
  status: 'generating', currentStage: 'generating', costUsd: '0.5', interestId: 'interest' };
const range = { chunkIdxFrom: 0, chunkIdxTo: 2 };
const pending = { id: 'module', unbookId: ids.unbookId, sortOrder: 0, title: 'Title', summary: 'Summary',
  sourcePageFrom: 1, sourcePageTo: 3, content: { pending: true, _sourceRange: range } };
const complete = { ...pending, content: { ...moduleResult.content, _sourceRange: range } };
const chunks = [{ id: chunkId, idx: 0, text: 'Text', pageFrom: 1, pageTo: 3, chapterTitle: null }];
const sections = [0, 1, 2].map((idx) => ({ id: `s${idx + 1}`, title: null,
  pageFrom: idx + 1, pageTo: idx + 1, chunkIdxFrom: idx, chunkIdxTo: idx, preview: 'Text' }));
function pair(book = unbook) { fake.results.push([source], [book]); }
function state(content: typeof complete | typeof pending = complete, questions = 6, cardCount = 5) {
  fake.results.push([content], [{ id: 'quiz', isActive: true }], Array.from({ length: questions }, () => ({})),
    Array.from({ length: cardCount }, () => ({})));
}
function advance() { fake.results.push([]); state(); fake.results.push([], [unbook], []); }
beforeEach(() => { fake.reset(); vi.useRealTimers(); vi.mocked(reconcileGame).mockClear(); });

describe('generation store writes', () => {
  it('persists outline once, locks source before unbook, and skips duplicate costs', async () => {
    pair(); fake.results.push([], [], [], [unbook], []);
    expect(await persistOutline(ids, outline, sections, 0.2)).toEqual({ moduleCount: 3 });
    pair(); fake.results.push([pending, pending, pending]);
    expect(await persistOutline(ids, outline, sections, 0.2)).toEqual({ moduleCount: 3 });
    expect(fake.recorded.inserts.filter((q) => q.table === modules)).toHaveLength(1);
    expect(fake.recorded.selects.slice(0, 2)).toEqual([
      { table: sources, forUpdate: true, limited: false }, { table: unbooks, forUpdate: true, limited: false },
    ]);
    expect(fake.recorded.transactionCount).toBe(2);
  });
  it('replaces pending content, preserves range, and ignores repeated content', async () => {
    pair(); fake.results.push([pending], chunks); advance();
    expect(await persistModuleContent(ids, 'module', moduleResult, 0.2)).toEqual({ stored: true });
    expect(fake.recorded.updates.find((q) => q.table === modules)?.set)
      .toMatchObject({ content: { _sourceRange: range, bigIdea: 'Idea' }, estimatedMinutes: 5 });
    pair(); fake.results.push([complete]);
    expect(await persistModuleContent(ids, 'module', moduleResult, 0.2)).toEqual({ stored: false });
    expect(fake.recorded.updates.filter((q) => q.table === modules)).toHaveLength(1);
  });
  it('replaces question-less partial quiz and stores quiz only once', async () => {
    pair(); fake.results.push([complete], [{ id: 'partial' }], [], [], chunks,
      [{ id: 'partial', isActive: true }], [], [{ id: 'created' }], []);
    state(); fake.results.push([], [unbook], []);
    expect(await persistQuiz(ids, 'module', quiz(), 0.2)).toEqual({ stored: true });
    expect(fake.recorded.deletes).toContainEqual({ table: quizzes });
    expect(fake.recorded.inserts.find((q) => q.table === quizQuestions)?.values).toHaveLength(6);
    pair(); fake.results.push([complete], [{ id: 'created' }], [{}], []);
    expect(await persistQuiz(ids, 'module', quiz(), 0.2)).toEqual({ stored: false });
    expect(fake.recorded.inserts.filter((q) => q.table === quizzes)).toHaveLength(1);
  });
  it('stores cards once', async () => {
    pair(); fake.results.push([complete], [], chunks); advance();
    expect(await persistCards(ids, 'module', cards, 0.2)).toEqual({ stored: true });
    pair(); fake.results.push([complete], [{}]);
    expect(await persistCards(ids, 'module', cards, 0.2)).toEqual({ stored: false });
    expect(fake.recorded.inserts.filter((q) => q.table === reviewCards)).toHaveLength(1);
  });
  it('refuses quiz and cards while content remains pending', async () => {
    pair(); fake.results.push([pending]);
    expect(await persistQuiz(ids, 'module', quiz(), 1)).toEqual({ stored: false });
    pair(); fake.results.push([pending]);
    expect(await persistCards(ids, 'module', cards, 1)).toEqual({ stored: false });
    expect(fake.recorded.inserts).toHaveLength(0);
  });
});

describe('completion and ownership', () => {
  it('charges exactly once in the profile local month', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T18:00:00Z'));
    fake.db.insert.mockImplementationOnce((table: unknown) => {
      return { values: (values: unknown) => {
        fake.recorded.inserts.push({ table, values });
        return { onConflictDoUpdate: () => Promise.resolve([]) };
      } };
    });
    pair(); state(); fake.results.push([{ timezone: 'Asia/Jakarta' }], [], []);
    expect(await finalizeGeneration(ids)).toEqual({ charged: true });
    pair({ ...unbook, status: 'ready' });
    expect(await finalizeGeneration(ids)).toEqual({ charged: false });
    expect(fake.recorded.inserts.filter((q) => q.table === usageCounters)).toEqual([
      { table: usageCounters, values: { userId: ids.userId, period: '2026-11', unbooksUsed: 1, pagesProcessed: 3 } },
    ]);
    expect(fake.recorded.transactionCount).toBe(2);
    // Only the charging call reconciles game state, in the same transaction.
    expect(reconcileGame).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reconcileGame).mock.calls[0]![1]).toBe(ids.userId);
  });
  it.each([[0, 5], [5, 5], [9, 5], [6, 4], [6, 9]])(
    'rejects incomplete question/card counts %i/%i without quota', async (questions, cardCount) => {
      pair(); state(complete, questions, cardCount);
      await expect(finalizeGeneration(ids)).rejects.toThrow('generationInvalid');
      expect(fake.recorded.inserts).toHaveLength(0);
    });
  it('rejects pending content at finalization', async () => {
    pair(); state(pending);
    await expect(finalizeGeneration(ids)).rejects.toThrow('generationInvalid');
  });
  it.each(['deleting', 'cancelling', 'deleted'])('all writers no-op for %s', async (stage) => {
    const operations = [() => startOutline(ids), () => persistOutline(ids, outline, sections, 1),
      () => persistModuleContent(ids, 'module', moduleResult, 1), () => persistQuiz(ids, 'module', quiz(), 1),
      () => persistCards(ids, 'module', cards, 1), () => persistTagging(ids, { interestSlug: 'general', modules: [] }),
      () => finalizeGeneration(ids), () => failGeneration(ids, 'generationInvalid')];
    for (const operation of operations) {
      if (stage === 'deleted') fake.results.push([]);
      else pair({ ...unbook, currentStage: stage });
      await operation();
    }
    expect(fake.recorded.inserts).toHaveLength(0);
    expect(fake.recorded.updates).toHaveLength(0);
    expect(fake.recorded.deletes).toHaveLength(0);
  });
  it('failure preserves modules and never touches usage counters', async () => {
    pair(); fake.results.push([]);
    await failGeneration(ids, 'generationInvalid');
    expect(fake.recorded.updates).toEqual([{ table: unbooks, set: { status: 'failed', currentStage: 'failed' } }]);
    expect(fake.recorded.inserts).toHaveLength(0);
    expect(fake.recorded.deletes).toHaveLength(0);
  });
});

describe('private context', () => {
  it('returns null for unowned, blocked, or unusable pairs', async () => {
    const loaders = [() => loadOutlineInput(ids), () => listModuleWork(ids),
      () => loadModuleInput(ids, 'module'), () => loadTaggingInput(ids)];
    for (const loader of loaders) {
      fake.results.push([]); expect(await loader()).toBeNull();
      pair({ ...unbook, currentStage: 'deleting' }); expect(await loader()).toBeNull();
      fake.results.push([{ ...source, status: 'failed' }], [unbook]); expect(await loader()).toBeNull();
    }
  });
  it('loads chunks after file deletion and exposes content summary only after content exists', async () => {
    pair(); fake.results.push([complete], chunks, [{ jobRole: 'Engineer', goal: 'Learn', experienceLevel: 'novice' }],
      [{ name: 'Learning' }]);
    expect(await loadModuleInput(ids, 'module')).toMatchObject({
      chunks: [{ id: chunkId, text: 'Text' }], summary: { bigIdea: 'Idea' }, interestName: 'Learning',
    });
  });
});

describe('stage metadata and tagging', () => {
  it('starts outlining, recognizes existing modules, and skips ready rows', async () => {
    pair(); fake.results.push([], []);
    expect(await startOutline(ids)).toEqual({ state: 'outline', moduleCount: 0 });
    expect(fake.recorded.updates[0]?.set).toEqual({ status: 'outlining', currentStage: 'outlining', progressPct: 5 });
    pair(); fake.results.push([pending]);
    expect(await startOutline(ids)).toEqual({ state: 'modules', moduleCount: 1 });
    pair({ ...unbook, status: 'ready' });
    expect(await startOutline(ids)).toEqual({ state: 'skip', moduleCount: 0 });
  });
  it('caps known costs at numeric(12,6) and calculates completed-step progress', async () => {
    pair(); fake.results.push([complete], [], chunks, []);
    state(); fake.results.push([], [{ ...unbook, costUsd: '999999.900000' }], []);
    await persistCards(ids, 'module', cards, 100);
    expect(fake.recorded.updates).toContainEqual({ table: unbooks,
      set: { currentStage: 'generating', progressPct: 85 } });
    expect(fake.recorded.updates).toContainEqual({ table: unbooks, set: { costUsd: '999999.999999' } });
  });
  it('keeps costs unchanged when unknown', async () => {
    pair(); fake.results.push([complete], [], chunks, []);
    state(); fake.results.push([]);
    await persistCards(ids, 'module', cards, null);
    expect(fake.recorded.updates.filter((row) => 'costUsd' in (row.set as object))).toHaveLength(0);
  });
  it('replaces domains, resolves only selected owned interest slugs, and ignores unknown domains', async () => {
    pair(); fake.results.push([complete], [{ interestId: 'learning' }],
      [{ id: 'learning', slug: 'learning', name: 'Learning', sortOrder: 0 }],
      [{ id: 'focus', slug: 'focus', name: 'Focus', sortOrder: 0 }], [], [], []);
    await persistTagging(ids, { interestSlug: 'learning', modules: [{ moduleIndex: 0, domains: [
      { domainSlug: 'focus', confidence: 0.8 }, { domainSlug: 'unknown', confidence: 0.3 },
    ] }] });
    expect(fake.recorded.deletes).toEqual([{ table: moduleDomains }]);
    expect(fake.recorded.inserts).toEqual([{ table: moduleDomains,
      values: [{ moduleId: 'module', domainId: 'focus', confidence: 0.8 }] }]);
    expect(fake.recorded.updates[0]?.set).toEqual({ interestId: 'learning', currentStage: 'tagging', progressPct: 90 });
  });
  it('general interest clears domains even when supplied domain candidates', async () => {
    pair(); fake.results.push([complete], [], [{ id: 'general', slug: 'general', name: 'Umum', sortOrder: 0 }], [], []);
    await persistTagging(ids, { interestSlug: 'general', modules: [{ moduleIndex: 0,
      domains: [{ domainSlug: 'focus', confidence: 1 }] }] });
    expect(fake.recorded.inserts).toHaveLength(0);
    expect(fake.recorded.deletes).toEqual([{ table: moduleDomains }]);
  });
  it('turns database error text into safe allowlisted errors', async () => {
    fake.db.transaction.mockRejectedValueOnce(new Error('private DB payload'));
    await expect(startOutline(ids)).rejects.toThrow('generationUnavailable');
  });
});
