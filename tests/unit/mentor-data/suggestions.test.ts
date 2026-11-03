import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', async () => {
  const { fake } = await import('../learning/fake-db');
  return { db: fake.db };
});

import { getSuggestedQuestions } from '@/lib/mentor/suggestions';
import { fake } from '../learning/fake-db';

const USER = { userId: '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f' };
const UNBOOK_ID = 'c3d4e5f6-7b8c-4d9e-af0f-2a3b4c5d6e7f';
const MODULE_A = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const MODULE_B = 'd4e5f6a7-8c9d-4eaf-b01f-3b4c5d6e7f8a';

function content(concepts: string[]) {
  return {
    bigIdea: '',
    whyItMatters: '',
    layers: {
      eli5: '',
      practitioner: concepts.map((concept) => ({ concept, explanation: 'x', chunkRefs: [] })),
      expert: { assumptions: [], evidence: [], critiques: [], compareWith: [] },
    },
    conceptMap: { nodes: [], edges: [] },
    application: {
      caseStudy: { title: '', situation: '', howToApply: [] },
      tools: [],
      actionThisWeek: { title: '', steps: [], doneWhen: '' },
      commonMistakes: [],
    },
    estimatedMinutes: 5,
  };
}

function queue(unbook: unknown[], modules: unknown[]) {
  fake.results.push(unbook, modules);
}

beforeEach(() => fake.reset());

describe('getSuggestedQuestions', () => {
  it('always returns exactly three keys built from titles and concepts', async () => {
    queue(
      [{ id: UNBOOK_ID, title: 'Filsafat Stoa' }],
      [
        { id: MODULE_A, title: 'Dikotomi Kendali', content: content(['Dikotomi', 'Amor Fati']) },
      ],
    );

    const suggestions = await getSuggestedQuestions(USER, UNBOOK_ID);

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]).toEqual({ key: 'summarizeModule', params: { module: 'Dikotomi Kendali' } });
    expect(suggestions[1]).toEqual({ key: 'explainConcept', params: { concept: 'Dikotomi' } });
    expect(suggestions[2]).toEqual({
      key: 'compareConcepts',
      params: { first: 'Dikotomi', second: 'Amor Fati' },
    });
  });

  it('focuses on one module when a module id is given', async () => {
    queue(
      [{ id: UNBOOK_ID, title: 'Filsafat Stoa' }],
      [
        { id: MODULE_A, title: 'Dikotomi Kendali', content: content(['Dikotomi']) },
        { id: MODULE_B, title: 'Amor Fati', content: content(['Amor Fati']) },
      ],
    );

    const suggestions = await getSuggestedQuestions(USER, UNBOOK_ID, MODULE_B);
    expect(suggestions[0]).toEqual({ key: 'summarizeModule', params: { module: 'Amor Fati' } });
    expect(suggestions).toHaveLength(3);
  });

  it('tolerates malformed and pending content while keeping three suggestions', async () => {
    queue(
      [{ id: UNBOOK_ID, title: 'Filsafat Stoa' }],
      [
        { id: MODULE_A, title: 'Dikotomi Kendali', content: { broken: true } },
        { id: MODULE_B, title: 'Amor Fati', content: { pending: true, chunkIdxFrom: 1 } },
      ],
    );

    const suggestions = await getSuggestedQuestions(USER, UNBOOK_ID);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((item) => item.key !== 'explainConcept')).toBe(true);
  });

  it('falls back to three generic keys when the Unbook has no modules', async () => {
    queue([{ id: UNBOOK_ID, title: 'Filsafat Stoa' }], []);

    const suggestions = await getSuggestedQuestions(USER, UNBOOK_ID);
    expect(suggestions.map((item) => item.key)).toEqual([
      'genericBigIdea',
      'genericExamples',
      'genericApply',
    ]);
  });

  it('rejects a foreign Unbook and a module outside it', async () => {
    fake.results.push([]);
    await expect(getSuggestedQuestions(USER, UNBOOK_ID)).rejects.toMatchObject({
      code: 'notFound',
    });

    fake.reset();
    queue(
      [{ id: UNBOOK_ID, title: 'Filsafat Stoa' }],
      [{ id: MODULE_A, title: 'Dikotomi Kendali', content: content(['Dikotomi']) }],
    );
    await expect(getSuggestedQuestions(USER, UNBOOK_ID, MODULE_B)).rejects.toMatchObject({
      code: 'notFound',
    });
  });
});
