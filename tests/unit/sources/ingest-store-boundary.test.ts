import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanLimits } from '@/lib/billing/plan-limits';
import type { SourceAllowance } from '@/lib/billing/source-quota';
import { SourceError, type SourceErrorCode } from '@/lib/sources/errors';
import {
  canSendIngestHandoff,
  embedSourceBatch,
  extractAndPersistSource,
  failSourceIngest,
  finishSourceIngest,
  type IngestIdentity,
} from '@/lib/sources/ingest-store';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  dbSelect: vi.fn(),
  getSourceAllowance: vi.fn(),
  runTask: vi.fn(),
  readSourceObject: vi.fn(),
  putSourceText: vi.fn(),
  deleteSourceObject: vi.fn(),
  chunkSource: vi.fn(),
  extractSource: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({
  db: {
    transaction: mocks.transaction,
    select: mocks.dbSelect,
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@/lib/ai/run-task', () => ({
  MAX_EMBEDDING_BATCH_SIZE: 16,
  runTask: mocks.runTask,
}));
vi.mock('@/lib/billing/source-quota', () => ({
  getSourceAllowance: mocks.getSourceAllowance,
  validateSourceFileSize: vi.fn(),
  validateSourcePageCount: vi.fn(),
}));
vi.mock('@/lib/ingest/chunk', () => ({ chunkSource: mocks.chunkSource }));
vi.mock('@/lib/ingest/extract', () => ({ extractSource: mocks.extractSource }));
vi.mock('@/lib/storage', () => ({
  deleteSourceObject: mocks.deleteSourceObject,
  putSourceText: mocks.putSourceText,
  readSourceObject: mocks.readSourceObject,
}));

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const IDS: IngestIdentity = { sourceId: SOURCE_ID, userId: USER_ID, unbookId: UNBOOK_ID };
const BATCH = { startIdx: 0, limit: 16 };

const LIMITS: PlanLimits = {
  unbooksPerMonth: 3,
  unbooksFairUse: 30,
  maxPagesPerSource: 800,
  maxFileMb: 20,
  mentorMessagesPerMonth: 100,
  originalsAccess: 'full',
  modelTier: 'main',
};

const ALLOWANCE: SourceAllowance = {
  planCode: 'free',
  limits: LIMITS,
  period: '2026-10',
  unbooksUsed: 0,
  unbooksPending: 0,
  remaining: 3,
};

const RAW_DB_ERROR = new Error('PRIVATE_SENTINEL postgres insert text params secret');

function expectNoSideChannels(): void {
  expect(mocks.runTask).not.toHaveBeenCalled();
  expect(mocks.readSourceObject).not.toHaveBeenCalled();
  expect(mocks.putSourceText).not.toHaveBeenCalled();
  expect(mocks.deleteSourceObject).not.toHaveBeenCalled();
}

function expectFreshSafeError(error: unknown, code: SourceErrorCode): void {
  expect(error).toBeInstanceOf(SourceError);
  const safe = error as SourceError;
  expect(safe).not.toBe(RAW_DB_ERROR);
  expect(safe.code).toBe(code);
  expect(safe.message).toBe(code);
  expect(safe.cause).toBeUndefined();
  expect(JSON.stringify(safe)).not.toContain('PRIVATE_SENTINEL');
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockReset();
  mocks.dbSelect.mockReset();
  mocks.getSourceAllowance.mockResolvedValue(ALLOWANCE);
});

describe('privacy boundary of durable ingest services', () => {
  it('extractAndPersistSource rebuilds a fresh processingFailed error from a raw transaction rejection', async () => {
    mocks.transaction.mockRejectedValue(RAW_DB_ERROR);

    const error = await rejectionOf(extractAndPersistSource(IDS));

    expectFreshSafeError(error, 'processingFailed');
    expect(mocks.getSourceAllowance).toHaveBeenCalledWith(USER_ID);
    expectNoSideChannels();
  });

  it('canSendIngestHandoff maps a raw select failure to the same safe error', async () => {
    mocks.transaction.mockRejectedValue(RAW_DB_ERROR);
    mocks.dbSelect.mockRejectedValue(RAW_DB_ERROR);

    const error = await rejectionOf(canSendIngestHandoff(IDS));

    expectFreshSafeError(error, 'processingFailed');
    expectNoSideChannels();
  });

  it('embed, finish and fail all fail safely at the transaction boundary', async () => {
    mocks.transaction.mockRejectedValue(RAW_DB_ERROR);

    for (const run of [
      () => embedSourceBatch(IDS, BATCH),
      () => finishSourceIngest(IDS),
      () => failSourceIngest(IDS, 'noText'),
    ]) {
      expectFreshSafeError(await rejectionOf(run()), 'processingFailed');
    }

    expect(mocks.getSourceAllowance).not.toHaveBeenCalled();
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expectNoSideChannels();
  });

  it('a SourceError thrown inside the transaction is rebuilt with only its code and a safe message', async () => {
    mocks.transaction.mockRejectedValue(
      new SourceError('embeddingUnavailable', 'PRIVATE_SENTINEL vendor message'),
    );

    const error = await rejectionOf(finishSourceIngest(IDS));

    expectFreshSafeError(error, 'embeddingUnavailable');
    expectNoSideChannels();
  });
});

describe('strict validation refuses before database, storage or AI', () => {
  it('malformed uuids are refused for every export before any db access', async () => {
    const malformed = {
      sourceId: 'not-a-uuid',
      userId: USER_ID,
      unbookId: UNBOOK_ID,
    } as IngestIdentity;

    for (const run of [
      () => extractAndPersistSource(malformed),
      () => embedSourceBatch(malformed, BATCH),
      () => finishSourceIngest(malformed),
      () => failSourceIngest(malformed, 'noText'),
      () => canSendIngestHandoff(malformed),
    ]) {
      expectFreshSafeError(await rejectionOf(run()), 'invalidInput');
    }

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.getSourceAllowance).not.toHaveBeenCalled();
    expectNoSideChannels();
  });

  it('extra user-controlled identity keys are refused before any db access', async () => {
    const extended = { ...IDS, note: 'extra user text' } as IngestIdentity;

    for (const run of [
      () => extractAndPersistSource(extended),
      () => embedSourceBatch(extended, BATCH),
      () => finishSourceIngest(extended),
      () => failSourceIngest(extended, 'noText'),
      () => canSendIngestHandoff(extended),
    ]) {
      expectFreshSafeError(await rejectionOf(run()), 'invalidInput');
    }

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.getSourceAllowance).not.toHaveBeenCalled();
    expectNoSideChannels();
  });

  it('embedding batch ranges outside the allowlist are refused before db or AI', async () => {
    const badBatches = [
      { startIdx: -1, limit: 16 },
      { startIdx: 0, limit: 0 },
      { startIdx: 0, limit: 17 },
      { startIdx: 0, limit: 16, extra: 'keys' },
    ] as unknown as Parameters<typeof embedSourceBatch>[1][];

    for (const batch of badBatches) {
      expectFreshSafeError(await rejectionOf(embedSourceBatch(IDS, batch)), 'invalidInput');
    }

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.runTask).not.toHaveBeenCalled();
    expect(mocks.getSourceAllowance).not.toHaveBeenCalled();
    expectNoSideChannels();
  });

  it('failSourceIngest refuses unsafe error codes and never repeats their message', async () => {
    const unsafe = 'PRIVATE_SENTINEL not-a-real-code' as unknown as SourceErrorCode;

    const error = await rejectionOf(failSourceIngest(IDS, unsafe));

    expectFreshSafeError(error, 'invalidInput');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expectNoSideChannels();
  });
});
