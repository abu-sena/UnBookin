import { beforeEach, describe, expect, it, vi } from 'vitest';
import { moduleResult, quiz as quizFixture } from '../generation/fixtures';

const mocks = vi.hoisted(() => ({
  reads: [] as unknown[][],
  txCount: 0,
  currentTx: 0,
  updates: [] as { tx: number; table: unknown; values: unknown }[],
  inserts: [] as { tx: number; table: unknown; values: unknown }[],
  dbSelect: vi.fn(),
  runStructuredTask: vi.fn(),
  validateQuiz: vi.fn(),
  sendQuizRegenerate: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai/structured', () => ({ runStructuredTask: mocks.runStructuredTask }));
vi.mock('@/lib/engine/generation/validate', () => ({ validateQuiz: mocks.validateQuiz }));
vi.mock('@/inngest/events', () => ({ sendQuizRegenerate: mocks.sendQuizRegenerate }));
vi.mock('@/db', () => ({
  db: {
    select: mocks.dbSelect,
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      mocks.txCount += 1;
      mocks.currentTx = mocks.txCount;
      return callback(createTx());
    }),
  },
}));

function chain(): unknown {
  const node: Record<string, unknown> = {};
  const next = () => Promise.resolve(mocks.reads.shift() ?? []);
  node.from = () => node;
  node.innerJoin = () => node;
  node.where = () => node;
  node.orderBy = next;
  node.limit = next;
  node.for = next;
  node.then = (resolve: (value: unknown) => unknown) => next().then(resolve);
  return node;
}

function createTx() {
  return {
    select: () => chain(),
    update: (table: unknown) => ({
      set: (values: unknown) => {
        mocks.updates.push({ tx: mocks.currentTx, table, values });
        return { where: async () => undefined };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        mocks.inserts.push({ tx: mocks.currentTx, table, values });
        return { returning: async () => [{ id: 'new-quiz-id' }] };
      },
    }),
  };
}

import { quizQuestions, quizzes } from '@/db/schema';
import { queueQuizVersion, regenerateQuizVersion } from '@/lib/generation/quiz-version';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const MODULE_ID = '30000000-0000-4000-8000-000000000001';
const OLD_QUIZ_ID = 'c3d4e5f6-7b8c-4d9e-af0f-2a3b4c5d6e7f';
const CHUNK_ID = '00000000-0000-4000-8000-000000000001';

const source = { id: SOURCE_ID, userId: USER_ID, status: 'ready' };
const unbook = {
  id: UNBOOK_ID,
  userId: USER_ID,
  sourceId: SOURCE_ID,
  status: 'ready',
  interestId: '40000000-0000-4000-8000-000000000001',
};
const moduleRow = {
  id: MODULE_ID,
  unbookId: UNBOOK_ID,
  sortOrder: 0,
  content: { ...moduleResult.content, _sourceRange: { chunkIdxFrom: 0, chunkIdxTo: 4 } },
};
const chunks = [{ id: CHUNK_ID, idx: 0, pageFrom: 1, pageTo: 1, text: 'Sumber.' }];
const ids = { userId: USER_ID, sourceId: SOURCE_ID, unbookId: UNBOOK_ID, moduleId: MODULE_ID };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.reads.length = 0;
  mocks.txCount = 0;
  mocks.currentTx = 0;
  mocks.updates.length = 0;
  mocks.inserts.length = 0;
  mocks.dbSelect.mockImplementation(() => chain());
  mocks.validateQuiz.mockReturnValue([]);
  mocks.sendQuizRegenerate.mockResolvedValue(undefined);
  mocks.runStructuredTask.mockResolvedValue({ data: quizFixture() });
});

describe('regenerateQuizVersion', () => {
  it('does nothing and never calls the model at three versions', async () => {
    mocks.reads.push(
      [source],
      [unbook],
      [moduleRow],
      [
        { id: 'v1', version: 1 },
        { id: 'v2', version: 2 },
        { id: 'v3', version: 3 },
      ],
    );

    const result = await regenerateQuizVersion(ids);

    expect(result).toEqual({ status: 'max', version: 0, versionCount: 3 });
    expect(mocks.runStructuredTask).not.toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.inserts).toHaveLength(0);
  });

  it('calls the quiz task with the previous prompts as data, then deactivates old versions in one transaction', async () => {
    mocks.reads.push(
      [source],
      [unbook],
      [moduleRow],
      [{ id: OLD_QUIZ_ID, version: 1 }],
      chunks,
      [{ jobRole: 'Manajer', goal: 'Fokus', experienceLevel: 'novice' }],
      [{ name: 'Belajar' }],
      [{ prompt: 'Soal lama yang jangan diulang' }],
      [source],
      [unbook],
      [moduleRow],
      [{ id: OLD_QUIZ_ID, version: 1 }],
      chunks,
    );

    const result = await regenerateQuizVersion(ids);

    expect(result).toEqual({ status: 'stored', version: 2, versionCount: 2 });
    const call = mocks.runStructuredTask.mock.calls[0]?.[0] as {
      task: string;
      prompt: { user: string };
    };
    expect(call.task).toBe('quiz');
    expect(call.prompt.user).toContain('Soal lama yang jangan diulang');
    expect(call.prompt.user).toContain('do not repeat or paraphrase');
    expect(mocks.validateQuiz).toHaveBeenCalledWith(expect.anything(), [CHUNK_ID]);

    expect(mocks.txCount).toBe(2);
    expect(mocks.updates).toEqual([
      { tx: 2, table: quizzes, values: { isActive: false } },
    ]);
    const quizInsert = mocks.inserts.find((entry) => entry.table === quizzes);
    const questionInsert = mocks.inserts.find((entry) => entry.table === quizQuestions);
    expect(quizInsert).toMatchObject({
      tx: 2,
      values: { moduleId: MODULE_ID, version: 2, isActive: true },
    });
    expect(Array.isArray(questionInsert?.values)).toBe(true);
    expect((questionInsert?.values as unknown[]).length).toBe(6);
  });
});

describe('queueQuizVersion', () => {
  it('sends an IDs-only event with a version-scoped id', async () => {
    mocks.reads.push(
      [{ moduleId: MODULE_ID, unbookId: UNBOOK_ID, sourceId: SOURCE_ID, sourceStatus: 'ready' }],
      [{ value: 1 }],
    );

    const result = await queueQuizVersion({ userId: USER_ID }, MODULE_ID);

    expect(result).toEqual({ queued: true, versionCount: 1 });
    expect(mocks.sendQuizRegenerate).toHaveBeenCalledWith(
      { userId: USER_ID, unbookId: UNBOOK_ID, sourceId: SOURCE_ID, moduleId: MODULE_ID },
      { eventId: `quiz-regenerate:${MODULE_ID}:1` },
    );
  });

  it('does not send at three versions', async () => {
    mocks.reads.push(
      [{ moduleId: MODULE_ID, unbookId: UNBOOK_ID, sourceId: SOURCE_ID, sourceStatus: 'ready' }],
      [{ value: 3 }],
    );

    const result = await queueQuizVersion({ userId: USER_ID }, MODULE_ID);

    expect(result).toEqual({ queued: false, versionCount: 3 });
    expect(mocks.sendQuizRegenerate).not.toHaveBeenCalled();
  });

  it('swallows send failures so the quiz result still renders', async () => {
    mocks.reads.push(
      [{ moduleId: MODULE_ID, unbookId: UNBOOK_ID, sourceId: SOURCE_ID, sourceStatus: 'ready' }],
      [{ value: 1 }],
    );
    mocks.sendQuizRegenerate.mockRejectedValue(new Error('inngest down'));

    const result = await queueQuizVersion({ userId: USER_ID }, MODULE_ID);

    expect(result).toEqual({ queued: false, versionCount: 1 });
  });
});
