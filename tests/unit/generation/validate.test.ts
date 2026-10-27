import { describe, expect, it } from 'vitest';

import type { QuizQuestion } from '@/lib/engine/generation/schemas';
import { validateCards, validateModule, validateOutline, validateQuiz, validateTagging } from '@/lib/engine/generation/validate';

import { cards, chunkId, moduleResult, otherChunkId, outline, quiz, tagging, taggingContext } from './fixtures';

describe('semantic validators', () => {
  it('accepts ordered, contiguous, exhaustive section groups', () => {
    expect(validateOutline(outline, ['s1', 's2', 's3'])).toEqual([]);
    const grouped = structuredClone(outline);
    grouped.modules[0]!.sectionIds = ['s1', 's2'];
    grouped.modules[1]!.sectionIds = ['s3'];
    grouped.modules[2]!.sectionIds = ['s4'];
    expect(validateOutline(grouped, ['s1', 's2', 's3', 's4'])).toEqual([]);
  });
  it.each([['s1', 's1', 's3'], ['s1', 'unknown', 's3'], ['s2', 's1', 's3'], ['s1', 's3']])('rejects invalid section sequence %j', (...ids) => {
    const result = structuredClone(outline);
    result.modules = ids.map((id) => ({ title: 'Title', summary: 'Summary', sectionIds: [id] }));
    expect(validateOutline(result, ['s1', 's2', 's3']).length).toBeGreaterThan(0);
  });
  it('accepts module references, graph and inclusive quote page boundaries', () => {
    for (const page of [1, 3]) {
      const result = structuredClone(moduleResult);
      result.content.keyQuote = { text: 'Quote', page };
      expect(validateModule(result, [chunkId], { pageFrom: 1, pageTo: 3 })).toEqual([]);
    }
    const result = structuredClone(moduleResult);
    delete result.content.keyQuote;
    expect(validateModule(result, [chunkId], { pageFrom: 1, pageTo: 3 })).toEqual([]);
  });
  it('rejects every module reference, graph and page failure without quoting content', () => {
    const mutations: ((result: typeof moduleResult) => void)[] = [
      (r) => { r.content.layers.practitioner[0]!.chunkRefs = []; },
      (r) => { r.content.layers.practitioner[0]!.chunkRefs = [otherChunkId]; },
      (r) => { r.content.conceptMap.nodes[1]!.id = 'core'; },
      (r) => { r.content.conceptMap.nodes[0]!.kind = 'concept'; },
      (r) => { r.content.conceptMap.nodes[1]!.kind = 'core'; },
      (r) => { r.content.conceptMap.nodes.push(...Array.from({ length: 19 }, (_, i) => ({ id: `n${i}`, label: 'Private text', kind: 'concept' as const }))); },
      (r) => { r.content.conceptMap.edges[0]!.from = 'missing'; },
      (r) => { r.content.conceptMap.edges[0]!.to = 'missing'; },
      (r) => { r.content.keyQuote = { text: 'Private text', page: 0 }; },
      (r) => { r.content.keyQuote = { text: 'Private text', page: 4 }; },
    ];
    for (const mutate of mutations) {
      const result = structuredClone(moduleResult);
      mutate(result);
      const issues = validateModule(result, [chunkId], { pageFrom: 1, pageTo: 3 });
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.join(' ')).not.toContain('Private text');
      expect(issues.join(' ')).not.toContain(otherChunkId);
    }
  });
  it('accepts quiz and rejects foreign chunks, invalid indexes and normalized duplicate prompts', () => {
    expect(validateQuiz(quiz(), [chunkId])).toEqual([]);
    const result = quiz();
    result.questions[0]!.chunkRefs = [otherChunkId];
    result.questions[1]!.prompt = `  ${result.questions[0]!.prompt.toUpperCase()}  `;
    result.questions[2] = { ...result.questions[2]!, type: 'multi_select', options: ['A', 'B', 'C', 'D'], correct: [0, 4] };
    expect(validateQuiz(result, [chunkId])).toEqual(['Unknown quiz chunk reference', 'Answer index outside option range', 'Duplicate question prompts']);
    for (const correct of [-1, 3, 0.5]) {
      const invalid = quiz();
      invalid.questions[0] = { ...invalid.questions[0]!, type: 'mcq', options: ['A', 'B', 'C'], correct };
      expect(validateQuiz(invalid, [chunkId])).toContain('Answer index outside option range');
    }
  });
  it.each([6, 7, 8])('enforces Bloom mix boundaries for n=%i', (n) => {
    const levels = (low: number, middle: number): QuizQuestion['bloomLevel'][] => [
      ...Array<QuizQuestion['bloomLevel']>(low).fill('remember'),
      ...Array<QuizQuestion['bloomLevel']>(middle).fill('apply'),
      ...Array<QuizQuestion['bloomLevel']>(n - low - middle).fill('evaluate'),
    ];
    expect(validateQuiz(quiz(levels(1, 2)), [chunkId])).toEqual([]);
    expect(validateQuiz(quiz(levels(Math.ceil(0.4 * n), 2)), [chunkId])).toEqual([]);
    expect(validateQuiz(quiz(levels(0, 2)), [chunkId])).toContain('Invalid lower Bloom mix');
    expect(validateQuiz(quiz(levels(Math.ceil(0.4 * n) + 1, 2)), [chunkId])).toContain('Invalid lower Bloom mix');
    expect(validateQuiz(quiz(levels(1, 1)), [chunkId])).toContain('Insufficient middle Bloom questions');
    expect(validateQuiz(quiz(levels(1, n - 1)), [chunkId])).toContain('Insufficient higher Bloom questions');
  });
  it('validates card references and duplicate fronts', () => {
    expect(validateCards(cards, [chunkId])).toEqual([]);
    const result = structuredClone(cards);
    result.cards[0]!.chunkRef = otherChunkId;
    result.cards[1]!.front = ` ${result.cards[0]!.front.toUpperCase()} `;
    expect(validateCards(result, [chunkId])).toEqual(['Unknown card chunk reference', 'Duplicate card fronts']);
  });
  it('validates taxonomy, complete module indexes and general fallback', () => {
    expect(validateTagging(tagging, taggingContext)).toEqual([]);
    expect(validateTagging({ interestSlug: 'general', modules: [{ moduleIndex: 0, domains: [] }] }, taggingContext)).toEqual([]);
    expect(validateTagging({ ...tagging, interestSlug: 'unknown' }, taggingContext)).toContain('Unknown interest slug');
    expect(validateTagging({ ...tagging, interestSlug: 'toString' }, taggingContext)).toContain('Unknown interest slug');
    for (const indexes of [[], [1], [0, 0], [-1], [0.5]]) {
      expect(validateTagging({ ...tagging, modules: indexes.map((moduleIndex) => ({ ...tagging.modules[0]!, moduleIndex })) }, taggingContext)).toContain('Each module index must occur exactly once');
    }
    expect(validateTagging(tagging, { ...taggingContext, allowedDomainSlugsByInterest: { learning: ['other'] } })).toContain('Domain does not belong to interest');
    expect(validateTagging({ ...tagging, interestSlug: 'general' }, taggingContext)).toContain('General interest cannot have domains');
    expect(validateTagging({ ...tagging, modules: [{ moduleIndex: 0, domains: [] }] }, taggingContext)).toContain('Non-general modules require domains');
  });
});
