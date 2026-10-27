import { describe, expect, it } from 'vitest';

import { CardsResult, GENERATION_TASKS, ModuleResult, OutlineResult, QuizQuestion, QuizResult, TaggingResult } from '@/lib/engine/generation/schemas';

import { cards, chunkId, moduleResult, outline, question, quiz, tagging } from './fixtures';

describe('generation schemas', () => {
  it('accepts every result and exports all task names', () => {
    expect(GENERATION_TASKS).toEqual(['outline', 'module', 'quiz', 'cards', 'tagging']);
    expect(OutlineResult.safeParse(outline).success).toBe(true);
    expect(ModuleResult.safeParse(moduleResult).success).toBe(true);
    expect(QuizResult.safeParse(quiz()).success).toBe(true);
    expect(CardsResult.safeParse(cards).success).toBe(true);
    expect(TaggingResult.safeParse(tagging).success).toBe(true);
  });
  it('rejects unknown fields at every newly defined object boundary', () => {
    expect(OutlineResult.safeParse({ ...outline, extra: 1 }).success).toBe(false);
    expect(OutlineResult.safeParse({ ...outline, modules: outline.modules.map((m) => ({ ...m, extra: 1 })) }).success).toBe(false);
    expect(ModuleResult.safeParse({ ...moduleResult, extra: 1 }).success).toBe(false);
    expect(QuizResult.safeParse({ ...quiz(), extra: 1 }).success).toBe(false);
    expect(QuizQuestion.safeParse({ ...question(0), extra: 1 }).success).toBe(false);
    expect(CardsResult.safeParse({ ...cards, extra: 1 }).success).toBe(false);
    expect(CardsResult.safeParse({ cards: cards.cards.map((c) => ({ ...c, extra: 1 })) }).success).toBe(false);
    expect(TaggingResult.safeParse({ ...tagging, extra: 1 }).success).toBe(false);
    expect(TaggingResult.safeParse({ ...tagging, modules: [{ ...tagging.modules[0], extra: 1 }] }).success).toBe(false);
    expect(TaggingResult.safeParse({ ...tagging, modules: [{ moduleIndex: 0, domains: [{ domainSlug: 'focus', confidence: 1, extra: 1 }] }] }).success).toBe(false);
  });
  it('enforces outline lengths, module count and nonempty section references', () => {
    for (const patch of [{ title: 'x'.repeat(121) }, { bigIdea: 'x'.repeat(221) }, { modules: outline.modules.slice(0, 2) }, { modules: Array(13).fill(outline.modules[0]) }]) {
      expect(OutlineResult.safeParse({ ...outline, ...patch }).success).toBe(false);
    }
    for (const patch of [{ title: 'x'.repeat(91) }, { summary: 'x'.repeat(301) }, { sectionIds: [] }]) {
      expect(OutlineResult.safeParse({ ...outline, modules: outline.modules.map((m) => ({ ...m, ...patch })) }).success).toBe(false);
    }
    expect(OutlineResult.safeParse({ ...outline, title: 'x'.repeat(120), bigIdea: 'x'.repeat(220) }).success).toBe(true);
  });
  it('reuses ModuleContent and caps module metadata', () => {
    expect(ModuleResult.safeParse({ ...moduleResult, title: 'x'.repeat(91) }).success).toBe(false);
    expect(ModuleResult.safeParse({ ...moduleResult, summary: 'x'.repeat(301) }).success).toBe(false);
    expect(ModuleResult.safeParse({ ...moduleResult, content: { ...moduleResult.content, estimatedMinutes: 26 } }).success).toBe(false);
  });
  it('accepts every question variant, including four score rubrics', () => {
    const base = { bloomLevel: 'create', prompt: 'Prompt', explanation: 'Explanation', chunkRefs: [chunkId] };
    expect(QuizQuestion.safeParse({ ...question(0), type: 'case_mcq' }).success).toBe(true);
    expect(QuizQuestion.safeParse({ ...base, type: 'multi_select', options: ['A', 'B', 'C', 'D'], correct: [0, 2] }).success).toBe(true);
    expect(QuizQuestion.safeParse({ ...base, type: 'short_answer', modelAnswer: 'Answer', rubric: ['1', '2', '3', '4'] }).success).toBe(true);
    for (const correct of [[0], [0, 0], [-1, 2], [0.5, 2]]) {
      expect(QuizQuestion.safeParse({ ...base, type: 'multi_select', options: ['A', 'B', 'C', 'D'], correct }).success).toBe(false);
    }
    expect(QuizQuestion.safeParse({ ...base, type: 'short_answer', modelAnswer: 'Answer', rubric: ['1', '2', '3'] }).success).toBe(false);
  });
  it('rejects invalid quiz counts, fields, options and references', () => {
    for (const count of [5, 9]) expect(QuizResult.safeParse({ questions: Array(count).fill(question(0)) }).success).toBe(false);
    for (const patch of [{ bloomLevel: 'unknown' }, { prompt: 'x'.repeat(601) }, { explanation: 'x'.repeat(601) }, { chunkRefs: [] }, { chunkRefs: ['not-uuid'] }, { correct: -1 }, { correct: 0.5 }, { options: ['A', 'B'] }, { options: Array(6).fill('A') }]) {
      expect(QuizQuestion.safeParse({ ...question(0), ...patch }).success).toBe(false);
    }
    for (const count of [3, 7]) expect(QuizQuestion.safeParse({ ...question(0), type: 'multi_select', options: Array(count).fill('A'), correct: [0, 1] }).success).toBe(false);
  });
  it('enforces card counts, lengths and UUIDs', () => {
    for (const count of [4, 9]) expect(CardsResult.safeParse({ cards: Array(count).fill(cards.cards[0]) }).success).toBe(false);
    for (const patch of [{ front: 'x'.repeat(201) }, { back: 'x'.repeat(401) }, { chunkRef: 'invalid' }]) {
      expect(CardsResult.safeParse({ cards: cards.cards.map((c) => ({ ...c, ...patch })) }).success).toBe(false);
    }
  });
  it('enforces tagging index, confidence and domain limits', () => {
    for (const moduleIndex of [-1, 0.5]) expect(TaggingResult.safeParse({ ...tagging, modules: [{ moduleIndex, domains: [] }] }).success).toBe(false);
    for (const confidence of [-0.1, 1.1]) expect(TaggingResult.safeParse({ ...tagging, modules: [{ moduleIndex: 0, domains: [{ domainSlug: 'focus', confidence }] }] }).success).toBe(false);
    expect(TaggingResult.safeParse({ ...tagging, modules: [{ moduleIndex: 0, domains: Array(4).fill({ domainSlug: 'focus', confidence: 1 }) }] }).success).toBe(false);
    expect(TaggingResult.safeParse({ interestSlug: 'general', modules: [{ moduleIndex: 0, domains: [] }] }).success).toBe(true);
  });
});
