import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const captured: { config: unknown; handler: unknown } = { config: undefined, handler: undefined };
  const createFunction = vi.fn((config: unknown, handler: unknown) => {
    captured.config = config;
    captured.handler = handler;
    return { id: 'ingest-source' };
  });
  return {
    createFunction,
    captured,
    extractAndPersistSource: vi.fn(),
    embedSourceBatch: vi.fn(),
    finishSourceIngest: vi.fn(),
    canSendIngestHandoff: vi.fn(),
    failSourceIngest: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/inngest/client', () => ({ inngest: { createFunction: mocks.createFunction } }));
vi.mock('@/lib/sources/ingest-store', () => ({
  extractAndPersistSource: mocks.extractAndPersistSource,
  embedSourceBatch: mocks.embedSourceBatch,
  finishSourceIngest: mocks.finishSourceIngest,
  canSendIngestHandoff: mocks.canSendIngestHandoff,
  failSourceIngest: mocks.failSourceIngest,
}));

import { NonRetriableError } from 'inngest';
import { SourceError } from '@/lib/sources/errors';
import { SOURCE_DELETED_EVENT, SOURCE_UPLOADED_EVENT } from '@/inngest/events';
import { ingestSource } from '@/inngest/ingest-source';

type StepEventInput = { id?: string; name: string; data: unknown };

type FakeStep = {
  run: <T>(id: string, callback: () => Promise<T>) => Promise<T>;
  sendEvent: (id: string, input: StepEventInput) => Promise<unknown>;
};

type StepRecord = { id: string; result?: unknown; error?: unknown };

type SentEvent = { id: string; name: string; data: unknown };

type HandlerArgs = { event: { data: unknown }; step: FakeStep };

type FailureEventShape = { event: { data: unknown }; error?: { message?: string } };

type FailureHandlerArgs = { event: { data: FailureEventShape }; step: FakeStep };

type IngestFunctionConfig = {
  id: string;
  triggers: { event: string }[];
  retries?: number;
  concurrency?: { limit: number; key?: string };
  cancelOn?: { event: string; if?: string }[];
  onFailure?: (args: FailureHandlerArgs) => Promise<unknown>;
};

type IngestHandler = (args: HandlerArgs) => Promise<unknown>;

const functionConfig = mocks.captured.config as IngestFunctionConfig;
const ingestHandler = mocks.captured.handler as IngestHandler;

function requireOnFailure(): NonNullable<IngestFunctionConfig['onFailure']> {
  const onFailure = functionConfig.onFailure;
  if (!onFailure) throw new Error('onFailure callback was not registered');
  return onFailure;
}

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

const ids = { sourceId: SOURCE_ID, userId: USER_ID, unbookId: UNBOOK_ID };

const SECRET_TEXT = 'SECRET-SOURCE-TEXT-sentinel';
const SECRET_KEY = 'SECRET-OBJECT-KEY-sentinel';
const SECRET_URL = 'SECRET-SOURCE-URL-sentinel';
const SECRET_VECTOR = 'SECRET-VECTOR-sentinel';
const SECRETS = [SECRET_TEXT, SECRET_KEY, SECRET_URL, SECRET_VECTOR];

const ALLOWED_OUTPUT_KEYS = new Set([
  'sourceId',
  'userId',
  'unbookId',
  'active',
  'alreadyIngested',
  'totalChunks',
  'embeddedChunks',
  'ingested',
  'handoffSent',
  'handled',
  'code',
  'marked',
]);

function createFakeStep(): { step: FakeStep; records: StepRecord[]; sentEvents: SentEvent[] } {
  const records: StepRecord[] = [];
  const sentEvents: SentEvent[] = [];
  const step: FakeStep = {
    run: async <T>(id: string, callback: () => Promise<T>): Promise<T> => {
      const record: StepRecord = { id };
      records.push(record);
      try {
        const result = await callback();
        record.result = result;
        return result;
      } catch (error) {
        record.error = error;
        throw error;
      }
    },
    sendEvent: async (id: string, input: StepEventInput): Promise<unknown> => {
      sentEvents.push({ id: input.id ?? id, name: input.name, data: input.data });
      return undefined;
    },
  };
  return { step, records, sentEvents };
}

function firstRecord(records: StepRecord[]): StepRecord {
  const record = records[0];
  if (!record) throw new Error('expected at least one step run');
  return record;
}

function expectNoSecrets(value: unknown): void {
  const json = JSON.stringify(value);
  for (const secret of SECRETS) {
    expect(json).not.toContain(secret);
  }
}

function expectMetadataOnly(value: unknown): void {
  if (typeof value !== 'object' || value === null) {
    expect(
      typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string',
    ).toBe(true);
    expectNoSecrets(value);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    expect(ALLOWED_OUTPUT_KEYS.has(key)).toBe(true);
    expect(['string', 'number', 'boolean']).toContain(typeof nested);
    expectNoSecrets(nested);
  }
}

function expectAllOutputsMetadataOnly(
  records: StepRecord[],
  sentEvents: SentEvent[],
  result: unknown,
): void {
  for (const record of records) expectMetadataOnly(record.result);
  for (const event of sentEvents) expectMetadataOnly(event.data);
  expectMetadataOnly(result);
}

async function caught<T>(promise: Promise<T>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ingest-source function configuration', () => {
  it('registers the uploaded trigger with bounded retries and per-source concurrency', () => {
    expect(ingestSource).toBeDefined();
    expect(typeof ingestHandler).toBe('function');
    expect(functionConfig.id).toBe('ingest-source');
    expect(functionConfig.triggers).toEqual([{ event: SOURCE_UPLOADED_EVENT }]);
    expect(functionConfig.retries).toBe(2);
    expect(functionConfig.concurrency).toEqual({ limit: 1, key: 'event.data.sourceId' });
  });

  it('cancels on source deletion only for the same source AND user', () => {
    expect(functionConfig.cancelOn).toEqual([
      {
        event: SOURCE_DELETED_EVENT,
        if: 'async.data.sourceId == event.data.sourceId && async.data.userId == event.data.userId',
      },
    ]);
  });
});

describe('ingest-source happy path', () => {
  it('embeds 39 chunks in 16/16/7 batches and sends the handoff only after finish', async () => {
    const { step, records, sentEvents } = createFakeStep();
    mocks.extractAndPersistSource.mockResolvedValue({
      active: true,
      totalChunks: 39,
      alreadyIngested: false,
    });
    mocks.embedSourceBatch.mockResolvedValueOnce({
      active: true,
      embeddedChunks: 16,
      totalChunks: 39,
    });
    mocks.embedSourceBatch.mockResolvedValueOnce({
      active: true,
      embeddedChunks: 16,
      totalChunks: 39,
    });
    mocks.embedSourceBatch.mockResolvedValueOnce({
      active: true,
      embeddedChunks: 7,
      totalChunks: 39,
    });
    mocks.finishSourceIngest.mockResolvedValue({ active: true, ingested: true });
    mocks.canSendIngestHandoff.mockResolvedValue(true);

    const result = await ingestHandler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).toEqual([
      'extract-source',
      'embed-0',
      'embed-16',
      'embed-32',
      'finish-ingest',
      'check-handoff',
    ]);
    expect(mocks.embedSourceBatch).toHaveBeenCalledTimes(3);
    expect(mocks.embedSourceBatch).toHaveBeenNthCalledWith(1, ids, { startIdx: 0, limit: 16 });
    expect(mocks.embedSourceBatch).toHaveBeenNthCalledWith(2, ids, { startIdx: 16, limit: 16 });
    expect(mocks.embedSourceBatch).toHaveBeenNthCalledWith(3, ids, { startIdx: 32, limit: 7 });
    expect(mocks.finishSourceIngest).toHaveBeenCalledTimes(1);
    expect(sentEvents).toEqual([
      {
        id: `unbook-requested:${SOURCE_ID}:${UNBOOK_ID}`,
        name: 'unbook/requested',
        data: ids,
      },
    ]);
    expect(result).toEqual({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
      alreadyIngested: false,
      totalChunks: 39,
      embeddedChunks: 39,
      ingested: true,
      handoffSent: true,
    });
    expectAllOutputsMetadataOnly(records, sentEvents, result);
  });

  it('keeps every step output free of source text, keys, urls and vectors', async () => {
    const { step, records, sentEvents } = createFakeStep();
    mocks.extractAndPersistSource.mockResolvedValue({
      active: true,
      totalChunks: 16,
      alreadyIngested: false,
    });
    mocks.embedSourceBatch.mockResolvedValueOnce({
      active: true,
      embeddedChunks: 16,
      totalChunks: 16,
    });
    mocks.finishSourceIngest.mockResolvedValue({ active: true, ingested: true });
    mocks.canSendIngestHandoff.mockResolvedValue(false);

    const result = await ingestHandler({ event: { data: ids }, step });

    expectNoSecrets(records);
    expectNoSecrets(sentEvents);
    expectNoSecrets(result);
    expectAllOutputsMetadataOnly(records, sentEvents, result);
  });
});

describe('ingest-source skips', () => {
  it('skips AI work and the handoff when the extract step reports an inactive pair', async () => {
    const { step, records, sentEvents } = createFakeStep();
    mocks.extractAndPersistSource.mockResolvedValue({
      active: false,
      totalChunks: 0,
      alreadyIngested: false,
    });

    const result = await ingestHandler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).toEqual(['extract-source']);
    expect(mocks.embedSourceBatch).not.toHaveBeenCalled();
    expect(mocks.finishSourceIngest).not.toHaveBeenCalled();
    expect(mocks.canSendIngestHandoff).not.toHaveBeenCalled();
    expect(sentEvents).toEqual([]);
    expect(result).toEqual({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
      alreadyIngested: false,
      totalChunks: 0,
      embeddedChunks: 0,
      ingested: false,
      handoffSent: false,
    });
  });

  it('skips embedding entirely when the source was already ingested', async () => {
    const { step, records, sentEvents } = createFakeStep();
    mocks.extractAndPersistSource.mockResolvedValue({
      active: true,
      totalChunks: 12,
      alreadyIngested: true,
    });
    mocks.finishSourceIngest.mockResolvedValue({ active: true, ingested: true });
    mocks.canSendIngestHandoff.mockResolvedValue(true);

    const result = await ingestHandler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).toEqual([
      'extract-source',
      'finish-ingest',
      'check-handoff',
    ]);
    expect(mocks.embedSourceBatch).not.toHaveBeenCalled();
    expect(result).toEqual({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
      alreadyIngested: true,
      totalChunks: 12,
      embeddedChunks: 0,
      ingested: true,
      handoffSent: true,
    });
    expect(sentEvents).toEqual([
      {
        id: `unbook-requested:${SOURCE_ID}:${UNBOOK_ID}`,
        name: 'unbook/requested',
        data: ids,
      },
    ]);
  });

  it('stops before finish and handoff when an embed batch reports an inactive pair', async () => {
    const { step, records, sentEvents } = createFakeStep();
    mocks.extractAndPersistSource.mockResolvedValue({
      active: true,
      totalChunks: 39,
      alreadyIngested: false,
    });
    mocks.embedSourceBatch.mockResolvedValue({
      active: false,
      embeddedChunks: 0,
      totalChunks: 0,
    });

    const result = await ingestHandler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).toEqual(['extract-source', 'embed-0']);
    expect(mocks.finishSourceIngest).not.toHaveBeenCalled();
    expect(mocks.canSendIngestHandoff).not.toHaveBeenCalled();
    expect(sentEvents).toEqual([]);
    expect(result).toEqual({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
      alreadyIngested: false,
      totalChunks: 39,
      embeddedChunks: 0,
      ingested: false,
      handoffSent: false,
    });
  });

  it('never sends the handoff when finish reports the pair as not ingested', async () => {
    const { step, records, sentEvents } = createFakeStep();
    mocks.extractAndPersistSource.mockResolvedValue({
      active: true,
      totalChunks: 5,
      alreadyIngested: false,
    });
    mocks.embedSourceBatch.mockResolvedValue({
      active: true,
      embeddedChunks: 5,
      totalChunks: 5,
    });
    mocks.finishSourceIngest.mockResolvedValue({ active: true, ingested: false });

    const result = await ingestHandler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).toEqual([
      'extract-source',
      'embed-0',
      'finish-ingest',
    ]);
    expect(mocks.canSendIngestHandoff).not.toHaveBeenCalled();
    expect(sentEvents).toEqual([]);
    expect(result).toEqual({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
      alreadyIngested: false,
      totalChunks: 5,
      embeddedChunks: 5,
      ingested: false,
      handoffSent: false,
    });
  });

  it('never sends the handoff when the handoff check returns false', async () => {
    const { step, records, sentEvents } = createFakeStep();
    mocks.extractAndPersistSource.mockResolvedValue({
      active: true,
      totalChunks: 3,
      alreadyIngested: false,
    });
    mocks.embedSourceBatch.mockResolvedValue({
      active: true,
      embeddedChunks: 3,
      totalChunks: 3,
    });
    mocks.finishSourceIngest.mockResolvedValue({ active: true, ingested: true });
    mocks.canSendIngestHandoff.mockResolvedValue(false);

    const result = await ingestHandler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).toEqual([
      'extract-source',
      'embed-0',
      'finish-ingest',
      'check-handoff',
    ]);
    expect(sentEvents).toEqual([]);
    expect(result).toEqual({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
      alreadyIngested: false,
      totalChunks: 3,
      embeddedChunks: 3,
      ingested: true,
      handoffSent: false,
    });
  });
});

describe('ingest-source error sanitization', () => {
  it('rejects an invalid DTO (including extra text) as a non-retriable error before any store call', async () => {
    const { step, records } = createFakeStep();
    const invalid = { ...ids, text: SECRET_TEXT };

    const error = await caught(ingestHandler({ event: { data: invalid }, step }));

    expect(error).toBeInstanceOf(NonRetriableError);
    expect((error as Error).message).toBe('invalidInput');
    expectNoSecrets(error);
    expect(records).toEqual([]);
    expect(mocks.extractAndPersistSource).not.toHaveBeenCalled();
    expect(mocks.embedSourceBatch).not.toHaveBeenCalled();
    expect(mocks.failSourceIngest).not.toHaveBeenCalled();
  });

  it('converts a raw driver error inside the captured step callback to a fresh safe processingFailed error', async () => {
    const { step, records, sentEvents } = createFakeStep();
    const rawDriverError = new Error(
      `deadlock detected on relation "sources"; SQL: insert into source_chunks (text) values ('${SECRET_TEXT}'); object key ${SECRET_KEY}`,
    );
    mocks.extractAndPersistSource.mockRejectedValue(rawDriverError);

    const error = await caught(ingestHandler({ event: { data: ids }, step }));

    expect(mocks.extractAndPersistSource).toHaveBeenCalledTimes(1);
    expect(error).not.toBe(rawDriverError);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).code).toBe('processingFailed');
    expect((error as Error).message).toBe('processingFailed');
    expect('cause' in (error as object)).toBe(false);
    expectNoSecrets(error);

    const record = firstRecord(records);
    expect(record.id).toBe('extract-source');
    expect(record.error).toBeInstanceOf(SourceError);
    expectNoSecrets(record.error);
    expect(sentEvents).toEqual([]);
  });

  it('maps SourceError noText to a NonRetriableError carrying only the code', async () => {
    const { step, records } = createFakeStep();
    mocks.extractAndPersistSource.mockRejectedValue(new SourceError('noText', SECRET_TEXT));

    const error = await caught(ingestHandler({ event: { data: ids }, step }));

    expect(error).toBeInstanceOf(NonRetriableError);
    expect((error as Error).message).toBe('noText');
    expect((error as Error).message).not.toContain(SECRET_TEXT);
    expectNoSecrets(error);
    expect(firstRecord(records).id).toBe('extract-source');
    expect(records).toHaveLength(1);
  });

  it('keeps a transient embeddingUnavailable error retryable', async () => {
    const { step, records } = createFakeStep();
    mocks.extractAndPersistSource.mockResolvedValue({
      active: true,
      totalChunks: 4,
      alreadyIngested: false,
    });
    mocks.embedSourceBatch.mockRejectedValue(new SourceError('embeddingUnavailable'));

    const error = await caught(ingestHandler({ event: { data: ids }, step }));

    expect(error).toBeInstanceOf(SourceError);
    expect(error).not.toBeInstanceOf(NonRetriableError);
    expect((error as SourceError).code).toBe('embeddingUnavailable');
    expect((error as Error).message).toBe('embeddingUnavailable');
    expect(firstRecord(records).id).toBe('extract-source');
    expect(records.map((record) => record.id)).toEqual(['extract-source', 'embed-0']);
    const embedRecord = records.find((record) => record.id === 'embed-0');
    expect(embedRecord?.error).toBeInstanceOf(SourceError);
  });
});

describe('ingest-source onFailure handler', () => {
  it('marks the ingest failed with the original nested DTO and an allowlisted code', async () => {
    const { step, records } = createFakeStep();
    mocks.failSourceIngest.mockResolvedValue(undefined);
    const onFailure = requireOnFailure();

    const result = await onFailure({
      event: { data: { event: { data: ids }, error: { message: 'noText' } } },
      step,
    });

    expect(mocks.failSourceIngest).toHaveBeenCalledTimes(1);
    expect(mocks.failSourceIngest).toHaveBeenCalledWith(ids, 'noText');
    expect(records.map((record) => record.id)).toEqual(['fail-ingest']);
    expect(firstRecord(records).result).toBe(true);
    expect(result).toEqual({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
      code: 'noText',
      marked: true,
    });
    expectNoSecrets(result);
  });

  it('falls back to processingFailed for a non-allowlisted failure message without leaking it', async () => {
    const { step, records } = createFakeStep();
    mocks.failSourceIngest.mockResolvedValue(undefined);
    const onFailure = requireOnFailure();

    const result = await onFailure({
      event: {
        data: {
          event: { data: ids },
          error: {
            message: `fetch failed for ${SECRET_URL} with key ${SECRET_KEY}: vendor stack trace`,
          },
        },
      },
      step,
    });

    expect(mocks.failSourceIngest).toHaveBeenCalledWith(ids, 'processingFailed');
    expect(firstRecord(records).result).toBe(true);
    expect(result).toEqual({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
      code: 'processingFailed',
      marked: true,
    });
    expectNoSecrets(result);
  });

  it('ignores an invalid DTO without running the failure step', async () => {
    const { step, records } = createFakeStep();
    const onFailure = requireOnFailure();

    const result = await onFailure({
      event: {
        data: {
          event: { data: { ...ids, sourceId: 'not-a-uuid' } },
          error: { message: 'noText' },
        },
      },
      step,
    });

    expect(result).toEqual({ handled: false });
    expect(records).toEqual([]);
    expect(mocks.failSourceIngest).not.toHaveBeenCalled();
  });

  it('fails the failure step with a sanitized error instead of swallowing a raw DB outage', async () => {
    const { step, records } = createFakeStep();
    const rawDbError = new Error(
      `ECONNREFUSED 10.0.0.9:5432 — SQL: update unbooks set status='failed' where id='${SECRET_KEY}'`,
    );
    mocks.failSourceIngest.mockRejectedValue(rawDbError);
    const onFailure = requireOnFailure();

    const error = await caught(
      onFailure({
        event: { data: { event: { data: ids }, error: { message: 'processingFailed' } } },
        step,
      }),
    );

    expect(mocks.failSourceIngest).toHaveBeenCalledTimes(1);
    expect(error).not.toBe(rawDbError);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).code).toBe('processingFailed');
    expect((error as Error).message).toBe('processingFailed');
    expect('cause' in (error as object)).toBe(false);
    expectNoSecrets(error);

    const record = firstRecord(records);
    expect(record.id).toBe('fail-ingest');
    expect(record.result).toBeUndefined();
    expect(record.error).toBeInstanceOf(SourceError);
    expectNoSecrets(record.error);
  });

  it('keeps a transient jobsUnavailable outage retryable by the failure handler', async () => {
    const { step, records } = createFakeStep();
    mocks.failSourceIngest.mockRejectedValue(new SourceError('jobsUnavailable'));
    const onFailure = requireOnFailure();

    const error = await caught(
      onFailure({
        event: { data: { event: { data: ids }, error: { message: 'fetchFailed' } } },
        step,
      }),
    );

    expect(error).toBeInstanceOf(SourceError);
    expect(error).not.toBeInstanceOf(NonRetriableError);
    expect((error as SourceError).code).toBe('jobsUnavailable');
    expect(firstRecord(records).id).toBe('fail-ingest');
  });
});
