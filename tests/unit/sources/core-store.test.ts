import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sign: vi.fn(),
  putText: vi.fn(),
  deleteObject: vi.fn(),
  sendEvent: vi.fn(),
  getAllowance: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/inngest/events', () => ({
  sendSourceUploaded: mocks.sendEvent,
  sendSourceDeleted: vi.fn(),
}));

vi.mock('@/lib/billing/source-quota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/source-quota')>();
  return { ...actual, getSourceAllowance: mocks.getAllowance };
});

vi.mock('@/db', async () => {
  const { fake } = await import('./core-fake-db');
  return { db: fake.db };
});

vi.mock('@/lib/storage', () => ({
  createSourceUploadUrl: mocks.sign,
  putSourceText: mocks.putText,
  deleteSourceObject: mocks.deleteObject,
  headSourceObject: vi.fn(),
  readSourceObject: vi.fn(),
}));

import { sources, unbooks, users } from '@/db/schema';
import type { PlanLimits } from '@/lib/billing/plan-limits';
import { SourceError } from '@/lib/sources/errors';
import { SOURCE_FILE_MIME_TYPES } from '@/lib/sources/schema';
import { createInlineSource, prepareFileSource } from '@/lib/sources/store';
import { fake } from './core-fake-db';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const INTEREST_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const PLAN_LIMITS: PlanLimits = {
  unbooksPerMonth: 2,
  unbooksFairUse: 5,
  maxPagesPerSource: 60,
  maxFileMb: 20,
  mentorMessagesPerMonth: 20,
  originalsAccess: 'sample',
  modelTier: 'economy',
};

function allowance(overrides: Record<string, unknown> = {}) {
  return {
    planCode: 'free',
    limits: PLAN_LIMITS,
    period: '2026-10',
    unbooksUsed: 0,
    unbooksPending: 0,
    remaining: 2,
    ...overrides,
  };
}

const fileInput = {
  title: 'Buku Produk',
  filename: 'buku.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  interestSlug: 'produk',
  rightsConfirmed: true as const,
};

beforeEach(() => {
  fake.reset();
  for (const mock of [
    mocks.sign,
    mocks.putText,
    mocks.deleteObject,
    mocks.sendEvent,
    mocks.getAllowance,
  ]) {
    mock.mockReset();
  }
  mocks.getAllowance.mockResolvedValue(allowance());
  mocks.sign.mockResolvedValue({
    fileKey: `sources/${USER_ID}/${SOURCE_ID}/source.pdf`,
    uploadUrl: 'https://signed.example/upload',
    expiresIn: 300,
  });
  mocks.sendEvent.mockResolvedValue(undefined);
});

describe('prepareFileSource', () => {
  it('signs before any reservation and leaves no rows when signing fails', async () => {
    mocks.sign.mockRejectedValue(new SourceError('storageUnavailable'));

    await expect(prepareFileSource(USER_ID, fileInput)).rejects.toMatchObject({
      code: 'storageUnavailable',
    });

    expect(mocks.sign).toHaveBeenCalledTimes(1);
    expect(fake.recorded.transactionCount).toBe(0);
    expect(fake.recorded.inserts).toHaveLength(0);
  });

  it('creates one source and one queued unbook in one serialized transaction', async () => {
    // users lock, interest lookup, insert sources, insert unbooks returning.
    fake.results.push([{ id: USER_ID }], [{ id: INTEREST_ID }], [], [{ id: 'unb-1' }]);

    const result = await prepareFileSource(USER_ID, fileInput);

    // Signing happened before the reservation transaction.
    const signOrder = mocks.sign.mock.invocationCallOrder[0] ?? 0;
    const txOrder = fake.db.transaction.mock.invocationCallOrder[0] ?? 0;
    expect(signOrder).toBeLessThan(txOrder);

    // Capacity check ran against the transaction database (serialized).
    const allowanceOptions = mocks.getAllowance.mock.calls[0]?.[2];
    expect(allowanceOptions).toMatchObject({ database: fake.tx });

    // Users row is locked FOR UPDATE first.
    expect(fake.recorded.selects[0]).toMatchObject({ table: users, forUpdate: true });

    expect(fake.recorded.inserts.map((entry) => entry.table)).toEqual([sources, unbooks]);
    const sourceValues = (fake.recorded.inserts[0]?.values ?? {}) as Record<string, unknown>;
    const unbookValues = (fake.recorded.inserts[1]?.values ?? {}) as Record<string, unknown>;
    expect(sourceValues).toMatchObject({
      userId: USER_ID,
      type: 'pdf',
      mimeType: SOURCE_FILE_MIME_TYPES.pdf,
      sizeBytes: 1024,
      status: 'uploaded',
    });
    expect(sourceValues.fileKey).toBe(`sources/${USER_ID}/${SOURCE_ID}/source.pdf`);
    expect(unbookValues).toMatchObject({
      userId: USER_ID,
      sourceId: sourceValues.id,
      interestId: INTEREST_ID,
      status: 'queued',
      currentStage: 'uploading',
      progressPct: 0,
    });

    expect(result).toMatchObject({
      unbookId: 'unb-1',
      uploadUrl: 'https://signed.example/upload',
      mimeType: SOURCE_FILE_MIME_TYPES.pdf,
    });
    expect(fake.recorded.transactionCount).toBe(1);
  });

  it('rejects quota exhaustion without inserting any row', async () => {
    mocks.getAllowance.mockResolvedValue(allowance({ remaining: 0 }));

    await expect(prepareFileSource(USER_ID, fileInput)).rejects.toMatchObject({
      code: 'quotaExceeded',
    });
    expect(fake.recorded.inserts).toHaveLength(0);
  });

  it('validates the file size against the CURRENT plan limits', async () => {
    mocks.getAllowance.mockResolvedValue(allowance({ remaining: 3 }));

    await expect(
      prepareFileSource(USER_ID, { ...fileInput, sizeBytes: 21 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: 'fileTooLarge' });
    expect(fake.recorded.inserts).toHaveLength(0);
  });

  it('rejects an inactive or unknown interest', async () => {
    fake.results.push([{ id: USER_ID }], []);

    await expect(prepareFileSource(USER_ID, fileInput)).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(fake.recorded.inserts).toHaveLength(0);
  });
});

describe('createInlineSource (text)', () => {
  const textInput = {
    title: 'Catatan',
    interestSlug: 'produk',
    text: 'Teks sumber panjang.',
  };

  it('fails before any reservation when the text object cannot be written', async () => {
    mocks.putText.mockRejectedValue(new SourceError('storageUnavailable'));

    await expect(createInlineSource(USER_ID, textInput)).rejects.toMatchObject({
      code: 'storageUnavailable',
    });

    expect(fake.recorded.transactionCount).toBe(0);
    expect(fake.recorded.inserts).toHaveLength(0);
  });

  it('stores the text in its own object, queues the unbook and sends the event', async () => {
    fake.results.push([{ id: USER_ID }], [{ id: INTEREST_ID }], [], [{ id: 'unb-1' }]);

    const result = await createInlineSource(USER_ID, textInput);

    expect(result).toMatchObject({ unbookId: 'unb-1' });
    const sourceValues = (fake.recorded.inserts[0]?.values ?? {}) as Record<string, unknown>;
    expect(sourceValues).toMatchObject({
      userId: USER_ID,
      type: 'text',
      mimeType: 'text/plain',
      status: 'uploaded',
      url: null,
    });
    expect(sourceValues.fileKey).toBe(`sources/${USER_ID}/${sourceValues.id}/source.txt`);
    expect(mocks.sendEvent).toHaveBeenCalledWith({
      sourceId: sourceValues.id,
      userId: USER_ID,
      unbookId: 'unb-1',
    });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it('marks the flow failed and keeps the text object for retry when queueing fails', async () => {
    // reservation tx, then markQueueFailed tx: source lock + unbook recheck.
    fake.results.push(
      [{ id: USER_ID }],
      [{ id: INTEREST_ID }],
      [],
      [{ id: 'unb-1' }],
      [{ id: SOURCE_ID }],
      [{ id: 'unb-1' }],
      [],
      [],
    );
    mocks.sendEvent.mockRejectedValue(new SourceError('jobsUnavailable'));

    await expect(createInlineSource(USER_ID, textInput)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });

    // The committed source keeps its raw text file: the retryable row would
    // be unusable without it.
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(fake.recorded.updates.map((entry) => entry.table)).toEqual([sources, unbooks]);
    expect(fake.recorded.updates[0]?.set).toMatchObject({
      status: 'failed',
      errorCode: 'jobsUnavailable',
    });
    expect(fake.recorded.updates[1]?.set).toMatchObject({
      status: 'failed',
      currentStage: 'failed',
    });
  });

  it('compensates (deletes) the unreferenced object when the reservation fails', async () => {
    mocks.getAllowance.mockResolvedValue(allowance({ remaining: 0 }));

    await expect(createInlineSource(USER_ID, textInput)).rejects.toMatchObject({
      code: 'quotaExceeded',
    });

    expect(fake.recorded.inserts).toHaveLength(0);
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
  });
});

describe('createInlineSource (url)', () => {
  it('stores the validated URL without touching storage', async () => {
    fake.results.push([{ id: USER_ID }], [{ id: INTEREST_ID }], [], [{ id: 'unb-2' }]);

    await createInlineSource(USER_ID, {
      title: 'Artikel',
      interestSlug: 'produk',
      url: 'https://example.com/artikel',
    });

    const sourceValues = (fake.recorded.inserts[0]?.values ?? {}) as Record<string, unknown>;
    expect(sourceValues).toMatchObject({
      type: 'url',
      url: 'https://example.com/artikel',
      mimeType: null,
      fileKey: null,
      sizeBytes: null,
    });
    expect(mocks.putText).not.toHaveBeenCalled();
    expect(mocks.sendEvent).toHaveBeenCalledTimes(1);
  });
});
