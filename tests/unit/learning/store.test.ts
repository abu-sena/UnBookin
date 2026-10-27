import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db', async () => {
  const { fake } = await import('./fake-db');
  return { db: fake.db };
});

import { LearningError } from '@/lib/learning/errors';
import {
  createActionFromModule,
  markModuleReading,
  markModuleRead,
  saveChecklist,
  startQuizAttempt,
} from '@/lib/learning/store';
import { actions, cardStates, moduleProgress, quizAttempts } from '@/db/schema';
import { fake } from './fake-db';

const USER = { userId: '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f' };
const USER_ID = USER.userId;
const MODULE_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const QUIZ_ID = 'c3d4e5f6-7b8c-4d9e-af0f-2a3b4c5d6e7f';
const ATTEMPT_ID = 'd4e5f6a7-8c9d-4eaf-b01f-3b4c5d6e7f8a';

const UNBOOK_ROW = {
  id: 'e5f6a7b8-9d0e-4fb0-c21a-4c5d6e7f8a9b',
  userId: USER_ID,
  status: 'ready',
  sourceId: null,
};

const MODULE_ROW = {
  id: MODULE_ID,
  unbookId: UNBOOK_ROW.id,
  sortOrder: 0,
  title: 'Modul',
  summary: null,
  content: {
    bigIdea: 'x',
    whyItMatters: 'y',
    layers: { eli5: '', practitioner: [], expert: { assumptions: [], evidence: [], critiques: [], compareWith: [] } },
    conceptMap: { nodes: [], edges: [] },
    application: {
      caseStudy: { title: 't', situation: 's', howToApply: [] },
      tools: [{ name: 'Ceklis', type: 'checklist', items: ['satu', 'dua', 'tiga'] }],
      actionThisWeek: { title: 'Aksi', steps: ['langkah'], doneWhen: 'selesai' },
      commonMistakes: [],
    },
    estimatedMinutes: 5,
  },
  estimatedMinutes: 5,
  sourcePageFrom: null,
  sourcePageTo: null,
};

beforeEach(() => {
  fake.reset();
  mocks.requireUser.mockResolvedValue(USER);
});

describe('identity is taken from the session, never the client', () => {
  it('rejects malformed identities', async () => {
    await expect(
      markModuleReading({ userId: 'forged' } as never, { moduleId: MODULE_ID }),
    ).rejects.toBeInstanceOf(LearningError);
    expect(fake.recorded.transactionCount).toBe(0);
  });

  it('rejects malformed module ids inside a transaction-free failure', async () => {
    await expect(markModuleReading(USER, { moduleId: 'nope' })).rejects.toBeInstanceOf(
      LearningError,
    );
    expect(fake.recorded.transactionCount).toBe(0);
  });
});

describe('markModuleRead', () => {
  it('marks read, awards XP once and seeds card states in one transaction', async () => {
    fake.results.push(
      [{ module: MODULE_ROW, unbook: UNBOOK_ROW }], // ownedReadyUnbook (for().limit)
      [{ id: 'event-1' }], // awardXp returning
      [{ id: 'card-1' }, { id: 'card-2' }, { id: 'card-3' }, { id: 'card-4' }, { id: 'card-5' }],
      [{ timezone: 'Asia/Jakarta' }],
      // ensureProgress and cardStates insert with onConflictDoNothing consume nothing.
    );

    const result = await markModuleRead(USER, { moduleId: MODULE_ID });

    expect(result).toEqual({ status: 'read', xpAwarded: true, cardsQueued: 5 });
    expect(fake.recorded.transactionCount).toBe(1);
    expect(fake.recorded.updates.some((entry) => entry.table === moduleProgress)).toBe(true);
    expect(fake.recorded.inserts.some((entry) => entry.table === cardStates)).toBe(true);
    const cardInsert = fake.recorded.inserts.find((entry) => entry.table === cardStates);
    expect(Array.isArray(cardInsert?.values)).toBe(true);
    expect((cardInsert?.values as unknown[]).length).toBe(5);
  });

  it('is idempotent through awardXp (second call: awarded false, same 5 cards)', async () => {
    fake.results.push(
      [{ module: MODULE_ROW, unbook: UNBOOK_ROW }],
      [{ id: 'event-1' }],
      [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }],
      [{ timezone: 'Asia/Jakarta' }],
    );
    const first = await markModuleRead(USER, { moduleId: MODULE_ID });
    expect(first.xpAwarded).toBe(true);

    fake.reset();
    // Second call: awardXp's returning yields NO row -> no XP.
    fake.results.push(
      [{ module: MODULE_ROW, unbook: UNBOOK_ROW }],
      [],
      [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }],
      [{ timezone: 'Asia/Jakarta' }],
    );
    const second = await markModuleRead(USER, { moduleId: MODULE_ID });
    expect(second.xpAwarded).toBe(false);
    expect(second.cardsQueued).toBe(5);
  });

  it('fails with notFound when the module is not the user\'s', async () => {
    fake.results.push([]); // ownedReadyUnbook -> no row
    await expect(markModuleRead(USER, { moduleId: MODULE_ID })).rejects.toMatchObject({
      code: 'notFound',
    });
  });

  it('fails with notFound when the unbook is not ready', async () => {
    fake.results.push([{ module: MODULE_ROW, unbook: { ...UNBOOK_ROW, status: 'generating' } }]);
    await expect(markModuleRead(USER, { moduleId: MODULE_ID })).rejects.toMatchObject({
      code: 'notFound',
    });
  });
});

describe('markModuleReading', () => {
  it('writes the reading status', async () => {
    fake.results.push([{ module: MODULE_ROW, unbook: UNBOOK_ROW }], []);
    const result = await markModuleReading(USER, { moduleId: MODULE_ID });
    expect(result).toEqual({ status: 'reading' });
    expect(fake.recorded.updates.some((entry) => entry.table === moduleProgress)).toBe(true);
  });
});

describe('saveChecklist', () => {
  it('stores indices for a tool and merges with existing state', async () => {
    fake.results.push([{ module: MODULE_ROW, unbook: UNBOOK_ROW }]); // ownedReadyUnbook
    fake.results.push([]); // ensureProgress
    fake.results.push([{ checklist: { '0': [0] } }]); // existing progress row

    const result = await saveChecklist(USER, {
      moduleId: MODULE_ID,
      toolIndex: 0,
      checkedIndices: [2, 1],
    });

    expect(result.checklist).toEqual({ '0': [1, 2] });
    const update = fake.recorded.updates.find((entry) => entry.table === moduleProgress);
    expect(update?.set).toMatchObject({ checklist: { '0': [1, 2] } });
  });

  it('rejects indices beyond the tool item count', async () => {
    fake.results.push([{ module: MODULE_ROW, unbook: UNBOOK_ROW }]);
    await expect(
      saveChecklist(USER, { moduleId: MODULE_ID, toolIndex: 0, checkedIndices: [3] }),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    expect(fake.recorded.updates).toHaveLength(0);
  });

  it('rejects an unknown tool index', async () => {
    fake.results.push([{ module: MODULE_ROW, unbook: UNBOOK_ROW }]);
    await expect(
      saveChecklist(USER, { moduleId: MODULE_ID, toolIndex: 9, checkedIndices: [] }),
    ).rejects.toMatchObject({ code: 'invalidInput' });
  });
});

describe('createActionFromModule', () => {
  it('creates the planned action with a +7 day due date', async () => {
    fake.results.push([{ module: MODULE_ROW, unbook: UNBOOK_ROW }]); // ownedReadyUnbook
    fake.results.push([]); // no existing planned action
    fake.results.push([{ id: 'action-1', dueAt: new Date('2026-11-03T00:00:00Z') }]);

    const before = Date.now();
    const result = await createActionFromModule(USER, { moduleId: MODULE_ID });
    const after = Date.now();

    expect(result.created).toBe(true);
    expect(result.actionId).toBe('action-1');
    const insert = fake.recorded.inserts.find((entry) => entry.table === actions);
    expect(insert?.values).toMatchObject({
      userId: USER_ID,
      moduleId: MODULE_ID,
      title: 'Aksi',
      description: 'langkah\nselesai',
    });
    const due = (insert?.values as { dueAt: Date }).dueAt.getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(due).toBeGreaterThanOrEqual(before + sevenDays);
    expect(due).toBeLessThanOrEqual(after + sevenDays);
  });

  it('returns the existing planned action instead of a duplicate', async () => {
    fake.results.push([{ module: MODULE_ROW, unbook: UNBOOK_ROW }]);
    fake.results.push([{ id: 'existing', dueAt: new Date('2026-11-01T00:00:00Z') }]);

    const result = await createActionFromModule(USER, { moduleId: MODULE_ID });

    expect(result).toEqual({
      actionId: 'existing',
      created: false,
      dueAt: new Date('2026-11-01T00:00:00Z'),
    });
    expect(fake.recorded.inserts.some((entry) => entry.table === actions)).toBe(false);
  });
});

describe('startQuizAttempt', () => {
  it('resumes the open attempt of the same quiz', async () => {
    fake.results.push([{ id: QUIZ_ID }]); // quiz ownership
    fake.results.push([{ id: ATTEMPT_ID }]); // open attempt

    const result = await startQuizAttempt(USER, { quizId: QUIZ_ID });

    expect(result).toEqual({ attemptId: ATTEMPT_ID, resumed: true });
    expect(fake.recorded.inserts.some((entry) => entry.table === quizAttempts)).toBe(false);
  });

  it('creates a new attempt when none is open', async () => {
    fake.results.push([{ id: QUIZ_ID }], [], [{ id: ATTEMPT_ID }]);
    const result = await startQuizAttempt(USER, { quizId: QUIZ_ID });
    expect(result).toEqual({ attemptId: ATTEMPT_ID, resumed: false });
    const insert = fake.recorded.inserts.find((entry) => entry.table === quizAttempts);
    expect(insert?.values).toMatchObject({ userId: USER_ID, quizId: QUIZ_ID, answers: {} });
  });

  it('fails when the quiz belongs to another user', async () => {
    fake.results.push([]); // ownership join -> no row
    await expect(startQuizAttempt(USER, { quizId: QUIZ_ID })).rejects.toMatchObject({
      code: 'notFound',
    });
  });
});
