import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  head: vi.fn(),
  deleteObject: vi.fn(),
  sendUploaded: vi.fn(),
  sendDeleted: vi.fn(),
  getAllowance: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/inngest/events', () => ({
  sendSourceUploaded: mocks.sendUploaded,
  sendSourceDeleted: mocks.sendDeleted,
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
  headSourceObject: mocks.head,
  deleteSourceObject: mocks.deleteObject,
  createSourceUploadUrl: vi.fn(),
  putSourceText: vi.fn(),
  readSourceObject: vi.fn(),
}));

import { sourceChunks, sources, unbooks, users } from '@/db/schema';
import type { PlanLimits } from '@/lib/billing/plan-limits';
import { SourceError } from '@/lib/sources/errors';
import {
  cancelSourceUpload,
  deleteOwnedUnbook,
  finalizeSourceUpload,
  retrySourceProcessing,
} from '@/lib/sources/lifecycle';
import { fake } from './core-fake-db';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const PDF_KEY = `sources/${USER_ID}/${SOURCE_ID}/source.pdf`;
const PLAN_LIMITS: PlanLimits = {
  unbooksPerMonth: 2,
  unbooksFairUse: 5,
  maxPagesPerSource: 60,
  maxFileMb: 20,
  mentorMessagesPerMonth: 20,
  originalsAccess: 'sample',
  modelTier: 'economy',
};

const sourceRow = {
  id: SOURCE_ID,
  userId: USER_ID,
  type: 'pdf',
  title: 'Buku',
  fileKey: PDF_KEY,
  url: null,
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  status: 'uploaded',
  errorCode: null,
};

beforeEach(() => {
  fake.reset();
  for (const mock of [
    mocks.head,
    mocks.deleteObject,
    mocks.sendUploaded,
    mocks.sendDeleted,
    mocks.getAllowance,
  ]) {
    mock.mockReset();
  }
  mocks.getAllowance.mockResolvedValue({
    planCode: 'free',
    limits: PLAN_LIMITS,
    period: '2026-10',
    unbooksUsed: 0,
    unbooksPending: 0,
    remaining: 2,
  });
  mocks.head.mockResolvedValue({ sizeBytes: 1024, mimeType: 'application/pdf' });
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.sendUploaded.mockResolvedValue(undefined);
  mocks.sendDeleted.mockResolvedValue(undefined);
});

describe('finalizeSourceUpload', () => {
  it('rejects a not-owned or missing source before any storage access', async () => {
    fake.results.push([]);

    await expect(finalizeSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'notFound',
    });
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.sendUploaded).not.toHaveBeenCalled();
  });

  it('verifies HEAD MIME against the stored metadata', async () => {
    fake.results.push([sourceRow]);
    mocks.head.mockResolvedValue({ sizeBytes: 1024, mimeType: 'application/epub+zip' });

    await expect(finalizeSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'fileType',
    });
    expect(fake.recorded.transactionCount).toBe(0);
  });

  it('revalidates the actual size against the CURRENT plan limits', async () => {
    // Matching presigned size, but beyond the plan maximum.
    const oversized = 21 * 1024 * 1024;
    fake.results.push([{ ...sourceRow, sizeBytes: oversized }]);
    mocks.head.mockResolvedValue({ sizeBytes: oversized, mimeType: 'application/pdf' });

    await expect(finalizeSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'fileTooLarge',
    });
    expect(fake.recorded.transactionCount).toBe(0);
  });

  it('rejects a size mismatch against the presigned metadata even below plan limits', async () => {
    fake.results.push([sourceRow]);
    mocks.head.mockResolvedValue({ sizeBytes: 2048, mimeType: 'application/pdf' });

    await expect(finalizeSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(fake.recorded.transactionCount).toBe(0);
    expect(mocks.sendUploaded).not.toHaveBeenCalled();
  });

  it('claims the transition under a source lock and sends one event', async () => {
    // owned source, tx lock, unbook lookup, claimed update, source update.
    fake.results.push([sourceRow], [sourceRow], [{ id: UNBOOK_ID }], [{ id: UNBOOK_ID }], []);

    const result = await finalizeSourceUpload(USER_ID, SOURCE_ID);

    expect(result).toEqual({ unbookId: UNBOOK_ID });
    expect(fake.recorded.selects[1]).toMatchObject({ table: sources, forUpdate: true });
    expect(fake.recorded.updates.map((entry) => entry.table)).toEqual([unbooks, sources]);
    expect(fake.recorded.updates[0]?.set).toEqual({ currentStage: 'reading' });
    expect(fake.recorded.updates[1]?.set).toEqual({
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });
    expect(mocks.sendUploaded).toHaveBeenCalledWith({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
    });
    expect(mocks.sendUploaded).toHaveBeenCalledTimes(1);
  });

  it('is idempotent for an already-submitted source and never double-sends', async () => {
    // owned source, tx lock, unbook lookup, claimed update returns 0 rows,
    // source metadata update, re-read of the existing unbook.
    fake.results.push([sourceRow], [sourceRow], [{ id: UNBOOK_ID }], [], [], [{ id: UNBOOK_ID }]);

    const result = await finalizeSourceUpload(USER_ID, SOURCE_ID);

    expect(result).toEqual({ unbookId: UNBOOK_ID });
    expect(mocks.sendUploaded).not.toHaveBeenCalled();
  });

  it('never sends a job for a source claimed by cancellation', async () => {
    // owned source, tx lock, unbook lookup, claim update returns 0 rows
    // (stage is `cancelling`), source metadata update, re-read of the unbook.
    fake.results.push([sourceRow], [sourceRow], [{ id: UNBOOK_ID }], [], [], [{ id: UNBOOK_ID }]);

    const result = await finalizeSourceUpload(USER_ID, SOURCE_ID);

    expect(result).toEqual({ unbookId: UNBOOK_ID });
    expect(mocks.sendUploaded).not.toHaveBeenCalled();
  });

  it('marks the flow failed (recoverable) when the queue send fails', async () => {
    fake.results.push(
      [sourceRow],
      [sourceRow],
      [{ id: UNBOOK_ID }],
      [{ id: UNBOOK_ID }],
      [],
      [sourceRow],
      [{ id: UNBOOK_ID }],
      [],
      [],
    );
    mocks.sendUploaded.mockRejectedValue(new SourceError('jobsUnavailable'));

    await expect(finalizeSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });

    expect(fake.recorded.updates.slice(-2).map((entry) => entry.table)).toEqual([sources, unbooks]);
    expect(fake.recorded.updates.at(-2)?.set).toMatchObject({
      status: 'failed',
      errorCode: 'jobsUnavailable',
    });
    expect(fake.recorded.updates.at(-1)?.set).toMatchObject({
      status: 'failed',
      currentStage: 'failed',
    });
  });

  it('never regresses a completed pair when the send acknowledgement fails late', async () => {
    // The event WAS delivered and processed; by the time the acknowledgement
    // fails the source is already `ready`. markQueueFailed must leave the
    // finished pair untouched (the guarded unbook recheck returns no row).
    fake.results.push(
      [sourceRow],
      [sourceRow],
      [{ id: UNBOOK_ID }],
      [{ id: UNBOOK_ID }],
      [],
      [{ ...sourceRow, status: 'ready' }],
      [],
    );
    mocks.sendUploaded.mockRejectedValue(new SourceError('jobsUnavailable'));

    await expect(finalizeSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });

    expect(fake.recorded.updates).toHaveLength(2); // claim + metadata only
    expect(fake.recorded.updates.at(-1)?.set).toEqual({
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });
  });
});

describe('cancelSourceUpload', () => {
  it('refuses to cancel once processing started (clear invalid state)', async () => {
    // owned source, claim tx lock, unbook lookup, claim update returns 0 rows.
    fake.results.push([sourceRow], [sourceRow], [{ id: UNBOOK_ID }], []);

    await expect(cancelSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(fake.recorded.deletes).toHaveLength(0);
    expect(mocks.sendDeleted).not.toHaveBeenCalled();
  });

  it('fails without DB changes when storage is unavailable (retryable cancel)', async () => {
    fake.results.push([sourceRow], [sourceRow], [{ id: UNBOOK_ID }], [{ id: UNBOOK_ID }], []);
    mocks.deleteObject.mockRejectedValue(new SourceError('storageUnavailable'));

    await expect(cancelSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'storageUnavailable',
    });

    // The claim and its restoration both happened; nothing was deleted.
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(fake.recorded.updates.map((entry) => entry.set)).toEqual([
      { currentStage: 'cancelling' },
      { currentStage: 'uploading' },
    ]);
    expect(fake.recorded.deletes).toHaveLength(0);
    expect(mocks.sendDeleted).not.toHaveBeenCalled();
  });

  it('deletes file, unbook, chunks and source, then sends the cancellation event', async () => {
    fake.results.push(
      [sourceRow],
      [sourceRow],
      [{ id: UNBOOK_ID }],
      [{ id: UNBOOK_ID }],
      [sourceRow],
      [{ id: UNBOOK_ID }],
      [],
      [],
      [],
    );

    await cancelSourceUpload(USER_ID, SOURCE_ID);

    expect(mocks.deleteObject).toHaveBeenCalledWith(PDF_KEY);
    expect(fake.recorded.deletes.map((entry) => entry.table)).toEqual([
      unbooks,
      sourceChunks,
      sources,
    ]);
    expect(mocks.sendDeleted).toHaveBeenCalledWith({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
    });
  });

  it('succeeds idempotently when the file never existed', async () => {
    const keyless = { ...sourceRow, fileKey: null };
    fake.results.push(
      [keyless],
      [keyless],
      [{ id: UNBOOK_ID }],
      [{ id: UNBOOK_ID }],
      [keyless],
      [{ id: UNBOOK_ID }],
      [],
      [],
      [],
    );

    await cancelSourceUpload(USER_ID, SOURCE_ID);

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.sendDeleted).toHaveBeenCalledTimes(1);
  });

  it('losing the claim race never deletes the file of the winning finalize', async () => {
    // finalize claimed `reading` first: the claim UPDATE returns zero rows and
    // NO storage delete happens — the running job keeps its file.
    fake.results.push([sourceRow], [sourceRow], [{ id: UNBOOK_ID }], []);

    await expect(cancelSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(fake.recorded.deletes).toHaveLength(0);
    expect(mocks.sendDeleted).not.toHaveBeenCalled();
  });

  it('claims cancellation under the source lock before deleting storage', async () => {
    fake.results.push(
      [sourceRow],
      [sourceRow],
      [{ id: UNBOOK_ID }],
      [{ id: UNBOOK_ID }],
      [sourceRow],
      [{ id: UNBOOK_ID }],
      [],
      [],
      [],
    );

    await cancelSourceUpload(USER_ID, SOURCE_ID);

    // The claim UPDATE (stage `cancelling`) happens BEFORE the destructive
    // storage call, inside its own committed claim transaction.
    expect(fake.recorded.updates[0]?.set).toEqual({ currentStage: 'cancelling' });
    const claimOrder = fake.db.update.mock.invocationCallOrder[0] ?? 0;
    const storageOrder = mocks.deleteObject.mock.invocationCallOrder[0] ?? 0;
    expect(claimOrder).toBeLessThan(storageOrder);
  });

  it('never fails after the data is gone just because the cancel event failed', async () => {
    fake.results.push(
      [sourceRow],
      [sourceRow],
      [{ id: UNBOOK_ID }],
      [{ id: UNBOOK_ID }],
      [sourceRow],
      [{ id: UNBOOK_ID }],
      [],
      [],
      [],
    );
    mocks.sendDeleted.mockRejectedValue(new SourceError('jobsUnavailable'));

    await expect(cancelSourceUpload(USER_ID, SOURCE_ID)).resolves.toBeUndefined();
    expect(fake.recorded.deletes.map((entry) => entry.table)).toEqual([
      unbooks,
      sourceChunks,
      sources,
    ]);
  });
});

describe('retrySourceProcessing', () => {
  const failedSource = { ...sourceRow, status: 'failed', errorCode: 'jobsUnavailable' };

  it('refuses to retry a source that is not failed', async () => {
    fake.results.push([{ id: UNBOOK_ID, sourceId: SOURCE_ID, status: 'ready' }]);

    await expect(retrySourceProcessing(USER_ID, UNBOOK_ID)).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(mocks.sendUploaded).not.toHaveBeenCalled();
  });

  it('rechecks serialized capacity excluding the same unbook', async () => {
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID, status: 'failed' }],
      [failedSource],
      [{ id: USER_ID }],
      [failedSource],
      [{ id: UNBOOK_ID }],
      [],
    );

    await retrySourceProcessing(USER_ID, UNBOOK_ID);

    const allowanceOptions = mocks.getAllowance.mock.calls[0]?.[2];
    expect(allowanceOptions).toMatchObject({
      database: fake.tx,
      excludeUnbookId: UNBOOK_ID,
    });
    expect(fake.recorded.selects.some((entry) => entry.table === users && entry.forUpdate)).toBe(
      true,
    );
    expect(fake.recorded.updates.map((entry) => entry.table)).toEqual([unbooks, sources]);
    expect(fake.recorded.updates[0]?.set).toEqual({
      status: 'queued',
      currentStage: 'reading',
      progressPct: 0,
    });
    expect(fake.recorded.updates[1]?.set).toEqual({ status: 'uploaded', errorCode: null });
    expect(mocks.sendUploaded).toHaveBeenCalledTimes(1);
  });

  it('rejects the retry when serialized capacity is exhausted', async () => {
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID, status: 'failed' }],
      [failedSource],
      [{ id: USER_ID }],
    );
    mocks.getAllowance.mockResolvedValue({
      planCode: 'free',
      limits: PLAN_LIMITS,
      period: '2026-10',
      unbooksUsed: 2,
      unbooksPending: 0,
      remaining: 0,
    });

    await expect(retrySourceProcessing(USER_ID, UNBOOK_ID)).rejects.toMatchObject({
      code: 'quotaExceeded',
    });
    expect(fake.recorded.updates).toHaveLength(0);
    expect(mocks.sendUploaded).not.toHaveBeenCalled();
  });

  it('marks a recoverable failed state when the retry event cannot be sent', async () => {
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID, status: 'failed' }],
      [failedSource],
      [{ id: USER_ID }],
      [failedSource],
      [{ id: UNBOOK_ID }],
      [],
      [failedSource],
      [{ id: UNBOOK_ID }],
      [],
      [],
    );
    mocks.sendUploaded.mockRejectedValue(new SourceError('jobsUnavailable'));

    await expect(retrySourceProcessing(USER_ID, UNBOOK_ID)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });
    expect(fake.recorded.updates.slice(-2).map((entry) => entry.table)).toEqual([sources, unbooks]);
    expect(fake.recorded.updates.at(-2)?.set).toMatchObject({
      status: 'failed',
      errorCode: 'jobsUnavailable',
    });
    expect(fake.recorded.updates.at(-1)?.set).toMatchObject({
      status: 'failed',
      currentStage: 'failed',
    });
  });
});

describe('deleteOwnedUnbook', () => {
  it('returns a safe notFound for a missing or foreign unbook', async () => {
    fake.results.push([]);

    await expect(deleteOwnedUnbook(USER_ID, UNBOOK_ID)).rejects.toMatchObject({
      code: 'notFound',
    });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(fake.recorded.transactionCount).toBe(0);
  });

  it('keeps every DB reference when storage deletion fails', async () => {
    fake.results.push([{ id: UNBOOK_ID, sourceId: SOURCE_ID }], [sourceRow], [{ value: 0 }]);
    mocks.deleteObject.mockRejectedValue(new SourceError('storageUnavailable'));

    await expect(deleteOwnedUnbook(USER_ID, UNBOOK_ID)).rejects.toMatchObject({
      code: 'storageUnavailable',
    });
    expect(fake.recorded.transactionCount).toBe(0);
    expect(fake.recorded.deletes).toHaveLength(0);
  });

  it('deletes storage first, then unbook, chunks and the unshared source', async () => {
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID }],
      [sourceRow],
      [{ value: 0 }],
      [sourceRow],
      [{ value: 0 }],
      [],
      [],
      [],
    );

    await deleteOwnedUnbook(USER_ID, UNBOOK_ID);

    const storageOrder = mocks.deleteObject.mock.invocationCallOrder[0] ?? 0;
    const txOrder = fake.db.transaction.mock.invocationCallOrder[0] ?? 0;
    expect(storageOrder).toBeLessThan(txOrder);

    expect(fake.recorded.deletes.map((entry) => entry.table)).toEqual([
      sourceChunks,
      sources,
      unbooks,
    ]);
    expect(fake.recorded.updates).toHaveLength(0);
  });

  it('never touches a shared source, its chunks or its file', async () => {
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID }],
      [sourceRow],
      [{ value: 2 }],
      [sourceRow],
      [{ value: 2 }],
      [],
    );

    await deleteOwnedUnbook(USER_ID, UNBOOK_ID);

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(fake.recorded.deletes.map((entry) => entry.table)).toEqual([unbooks]);
  });

  it('deletes only the unbook when it has no source', async () => {
    fake.results.push([{ id: UNBOOK_ID, sourceId: null }], []);

    await deleteOwnedUnbook(USER_ID, UNBOOK_ID);

    expect(fake.recorded.deletes.map((entry) => entry.table)).toEqual([unbooks]);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
