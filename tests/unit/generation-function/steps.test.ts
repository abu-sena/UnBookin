import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runStructuredTask: vi.fn(),
  loadOutlineInput: vi.fn(),
  loadModuleInput: vi.fn(),
  loadTaggingInput: vi.fn(),
  persistOutline: vi.fn(),
  persistModuleContent: vi.fn(),
  persistQuiz: vi.fn(),
  persistCards: vi.fn(),
  persistTagging: vi.fn(),
  finalizeGeneration: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai/structured', () => ({ runStructuredTask: mocks.runStructuredTask }));
vi.mock('@/lib/generation/context', () => ({
  loadOutlineInput: mocks.loadOutlineInput,
  loadModuleInput: mocks.loadModuleInput,
  loadTaggingInput: mocks.loadTaggingInput,
}));
vi.mock('@/lib/generation/store', () => ({
  persistOutline: mocks.persistOutline,
  persistModuleContent: mocks.persistModuleContent,
  persistQuiz: mocks.persistQuiz,
  persistCards: mocks.persistCards,
  persistTagging: mocks.persistTagging,
  finalizeGeneration: mocks.finalizeGeneration,
}));

import { CardsResult, ModuleResult, OutlineResult, QuizResult, TaggingResult } from '@/lib/engine/generation/schemas';
import {
  runCardsStep,
  runFinalizeStep,
  runModuleContentStep,
  runOutlineStep,
  runQuizStep,
  runTaggingStep,
} from '@/lib/generation/steps';
import { cards, chunkId, moduleResult, outline, otherChunkId, quiz, tagging } from '../generation/fixtures';

const ids = {
  sourceId: '00000000-0000-4000-8000-000000000010',
  userId: '00000000-0000-4000-8000-000000000011',
  unbookId: '00000000-0000-4000-8000-000000000012',
};
const chunks = [{ id: chunkId, pageFrom: 1, pageTo: 3, text: 'Source text' }];
const profile = { jobRole: 'Engineer', goal: 'Learn', experienceLevel: 'novice' };
const summary = { bigIdea: moduleResult.content.bigIdea, practitioner: moduleResult.content.layers.practitioner };
const sections = [1, 2, 3].map((page) => ({ id: `s${page}`, title: null, pageFrom: page, pageTo: page,
  chunkIdxFrom: page - 1, chunkIdxTo: page - 1, preview: 'Text' }));
const moduleInput = { module: { sortOrder: 0, title: 'Module', summary: 'Summary', pageFrom: 1, pageTo: 3 },
  chunks, profile, interestName: 'Learning', summary };
const outlineInput = { sections, profile, interestName: 'Learning' };
const taggingInput = { modules: [{ index: 0, title: 'Module', summary: 'Summary' }],
  interests: [{ slug: 'general', name: 'Umum', domains: [] },
    { slug: 'learning', name: 'Belajar', domains: [{ slug: 'focus', name: 'Fokus' }] }] };

type Call = { task: string; schema: unknown; userId: string; validate: (data: unknown) => string[] };
function call(index = 0): Call {
  return mocks.runStructuredTask.mock.calls[index]![0] as Call;
}
function result<T>(data: T, costUsd = 0.25) {
  return { data, model: 'configured-model', usedFallback: false, costUsd, costComplete: true, calls: 1 };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadOutlineInput.mockResolvedValue(outlineInput);
  mocks.loadModuleInput.mockResolvedValue(moduleInput);
  mocks.loadTaggingInput.mockResolvedValue(taggingInput);
  mocks.persistOutline.mockResolvedValue({ moduleCount: 3 });
  mocks.persistModuleContent.mockResolvedValue({ stored: true });
  mocks.persistQuiz.mockResolvedValue({ stored: true });
  mocks.persistCards.mockResolvedValue({ stored: true });
  mocks.persistTagging.mockResolvedValue(undefined);
  mocks.finalizeGeneration.mockResolvedValue({ charged: true });
});

describe('outline step service', () => {
  it('forwards the router cost and section IDs, then returns the module count', async () => {
    mocks.runStructuredTask.mockResolvedValue(result(outline, 0.4));

    expect(await runOutlineStep(ids)).toEqual({ moduleCount: 3 });
    expect(call().task).toBe('outline');
    expect(call().schema).toBe(OutlineResult);
    expect(call().userId).toBe(ids.userId);
    expect(mocks.persistOutline).toHaveBeenCalledWith(ids, outline, sections, 0.4);

    const invalid = { ...outline, modules: [outline.modules[0]!] };
    expect(call().validate(invalid)).toContain('Sections must be used exactly once');
    expect(call().validate(outline)).toEqual([]);
  });

  it('skips without an AI call when the outline loader returns null', async () => {
    mocks.loadOutlineInput.mockResolvedValue(null);

    expect(await runOutlineStep(ids)).toEqual({ skipped: true });
    expect(mocks.runStructuredTask).not.toHaveBeenCalled();
    expect(mocks.persistOutline).not.toHaveBeenCalled();
  });
});

describe('module step services', () => {
  it('wires module validation to loaded chunk IDs, page range, and cost', async () => {
    mocks.runStructuredTask.mockResolvedValue(result(moduleResult, 0.6));

    expect(await runModuleContentStep(ids, 'module-1')).toEqual({ stored: true });
    expect(call().task).toBe('module');
    expect(call().schema).toBe(ModuleResult);
    expect(mocks.persistModuleContent).toHaveBeenCalledWith(ids, 'module-1', moduleResult, 0.6);

    expect(call().validate(moduleResult)).toEqual([]);
    const unknownChunk = { ...moduleResult, content: { ...moduleResult.content, layers: {
      ...moduleResult.content.layers,
      practitioner: [{ concept: 'C', explanation: 'E', chunkRefs: [otherChunkId] }],
    } } };
    expect(call().validate(unknownChunk)).toContain('Unknown module chunk reference');
    const badPage = { ...moduleResult, content: { ...moduleResult.content, keyQuote: { text: 'Q', page: 99 } } };
    expect(call().validate(badPage)).toContain('Quote page outside module range');
  });

  it('wires quiz validation and cost to the persisted result', async () => {
    mocks.runStructuredTask.mockResolvedValue(result(quiz(), 0.7));

    expect(await runQuizStep(ids, 'module-1')).toEqual({ stored: true });
    expect(call().task).toBe('quiz');
    expect(call().schema).toBe(QuizResult);
    expect(mocks.persistQuiz).toHaveBeenCalledWith(ids, 'module-1', quiz(), 0.7);
    expect(call().validate(quiz())).toEqual([]);
    const foreign = { questions: [quiz().questions[0]!, { ...quiz().questions[1]!, chunkRefs: [otherChunkId] }] };
    expect(call().validate(foreign)).toContain('Unknown quiz chunk reference');
  });

  it('wires card validation and cost to the persisted result', async () => {
    mocks.runStructuredTask.mockResolvedValue(result(cards, 0.1));

    expect(await runCardsStep(ids, 'module-1')).toEqual({ stored: true });
    expect(call().task).toBe('cards');
    expect(call().schema).toBe(CardsResult);
    expect(mocks.persistCards).toHaveBeenCalledWith(ids, 'module-1', cards, 0.1);
    expect(call().validate(cards)).toEqual([]);
    const foreign = { cards: [cards.cards[0]!, { ...cards.cards[1]!, chunkRef: otherChunkId }] };
    expect(call().validate(foreign)).toContain('Unknown card chunk reference');
  });

  it('skips quiz and cards while module content is still absent', async () => {
    const withoutSummary = { ...moduleInput, summary: undefined } as unknown as typeof moduleInput;
    mocks.loadModuleInput.mockResolvedValue(withoutSummary);

    expect(await runQuizStep(ids, 'module-1')).toEqual({ skipped: true });
    expect(await runCardsStep(ids, 'module-1')).toEqual({ skipped: true });
    expect(mocks.runStructuredTask).not.toHaveBeenCalled();
  });

  it('skips every module step without an AI call when the loader returns null', async () => {
    mocks.loadModuleInput.mockResolvedValue(null);

    expect(await runModuleContentStep(ids, 'module-1')).toEqual({ skipped: true });
    expect(await runQuizStep(ids, 'module-1')).toEqual({ skipped: true });
    expect(await runCardsStep(ids, 'module-1')).toEqual({ skipped: true });
    expect(mocks.runStructuredTask).not.toHaveBeenCalled();
  });
});

describe('tagging and finalize step services', () => {
  it('validates against the loaded taxonomy and returns metadata only', async () => {
    mocks.runStructuredTask.mockResolvedValue(result(tagging));

    expect(await runTaggingStep(ids)).toEqual({ tagged: true });
    expect(call().task).toBe('tagging');
    expect(call().schema).toBe(TaggingResult);
    expect(call().validate(tagging)).toEqual([]);
    expect(call().validate({ interestSlug: 'unknown', modules: [] })).toContain('Unknown interest slug');
    expect(mocks.persistTagging).toHaveBeenCalledWith(ids, tagging);
  });

  it('skips tagging when the loader returns null', async () => {
    mocks.loadTaggingInput.mockResolvedValue(null);

    expect(await runTaggingStep(ids)).toEqual({ skipped: true });
    expect(mocks.runStructuredTask).not.toHaveBeenCalled();
    expect(mocks.persistTagging).not.toHaveBeenCalled();
  });

  it('returns whether finalization charged the quota', async () => {
    expect(await runFinalizeStep(ids)).toEqual({ charged: true });
    mocks.finalizeGeneration.mockResolvedValue({ charged: false });
    expect(await runFinalizeStep(ids)).toEqual({ charged: false });
    expect(mocks.finalizeGeneration).toHaveBeenCalledWith(ids);
  });
});
