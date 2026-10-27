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
    // owned source, tx lock, unbook lookup (already past `uploading`), claim
    // update returns 0 rows, re-read of the existing unbook. The claim failed,
    // so NO source metadata update query runs at all.
    fake.results.push(
      [sourceRow],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'reading' }],
      [],
      [{ id: UNBOOK_ID }],
    );

    const result = await finalizeSourceUpload(USER_ID, SOURCE_ID);

    expect(result).toEqual({ unbookId: UNBOOK_ID });
    expect(mocks.sendUploaded).not.toHaveBeenCalled();
  });

  it('never sends a job for a source claimed by cancellation', async () => {
    // owned source, tx lock, unbook lookup at stage `cancelling`, claim update
    // returns 0 rows: a safe invalidInput rejection — no event, no storage
    // delete, no source metadata update.
    fake.results.push(
      [sourceRow],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'cancelling' }],
      [],
    );

    await expect(finalizeSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(mocks.sendUploaded).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(fake.recorded.updates.some((entry) => entry.table === sources)).toBe(false);
  });

  it('never sends a job for a source claimed by deletion', async () => {
    fake.results.push([sourceRow], [sourceRow], [{ id: UNBOOK_ID, currentStage: 'deleting' }], []);

    await expect(finalizeSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(mocks.sendUploaded).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(fake.recorded.updates.some((entry) => entry.table === sources)).toBe(false);
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
    // owned source, claim tx lock, locked unbook already past `uploading`.
    fake.results.push([sourceRow], [sourceRow], [{ id: UNBOOK_ID, currentStage: 'reading' }]);

    await expect(cancelSourceUpload(USER_ID, SOURCE_ID)).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(fake.recorded.deletes).toHaveLength(0);
    expect(mocks.sendDeleted).not.toHaveBeenCalled();
  });

  it('fails without DB changes when storage is unavailable (retryable cancel)', async () => {
    // owned source, claim lock, locked unbook at `uploading`, claim update,
    // then the guarded restore back to `uploading` after the storage failure.
    fake.results.push(
      [sourceRow],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'uploading' }],
      [{ id: UNBOOK_ID }],
      [],
    );
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
    // owned source, claim lock, locked unbook (uploading), claim update, then
    // AFTER storage: cleanup lock, locked unbook (cancelling), unbook delete,
    // ref count 0, chunk delete, source delete.
    fake.results.push(
      [sourceRow],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'uploading' }],
      [{ id: UNBOOK_ID }],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'cancelling' }],
      [],
      [{ value: 0 }],
      [],
      [],
    );

    await cancelSourceUpload(USER_ID, SOURCE_ID);

    expect(mocks.deleteObject).toHaveBeenCalledWith(PDF_KEY);
    const [unbookDelete, chunkDelete, sourceDelete] = fake.recorded.deletes;
    expect(unbookDelete?.table).toBe(unbooks);
    expect(chunkDelete?.table).toBe(sourceChunks);
    expect(sourceDelete?.table).toBe(sources);
    expect(fake.recorded.deletes).toHaveLength(3);
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
      [{ id: UNBOOK_ID, currentStage: 'uploading' }],
      [{ id: UNBOOK_ID }],
      [keyless],
      [{ id: UNBOOK_ID, currentStage: 'cancelling' }],
      [],
      [{ value: 0 }],
      [],
      [],
    );

    await cancelSourceUpload(USER_ID, SOURCE_ID);

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.sendDeleted).toHaveBeenCalledTimes(1);
  });

  it('losing the claim race never deletes the file of the winning finalize', async () => {
    // finalize claimed `reading` first: the guarded claim UPDATE returns zero
    // rows and NO storage delete happens — the running job keeps its file.
    fake.results.push([sourceRow], [sourceRow], [{ id: UNBOOK_ID, currentStage: 'uploading' }], []);

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
      [{ id: UNBOOK_ID, currentStage: 'uploading' }],
      [{ id: UNBOOK_ID }],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'cancelling' }],
      [],
      [{ value: 0 }],
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
      [{ id: UNBOOK_ID, currentStage: 'uploading' }],
      [{ id: UNBOOK_ID }],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'cancelling' }],
      [],
      [{ value: 0 }],
      [],
      [],
    );
    mocks.sendDeleted.mockRejectedValue(new SourceError('jobsUnavailable'));

    await expect(cancelSourceUpload(USER_ID, SOURCE_ID)).resolves.toBeUndefined();
    const [unbookDelete, chunkDelete, sourceDelete] = fake.recorded.deletes;
    expect(unbookDelete?.table).toBe(unbooks);
    expect(chunkDelete?.table).toBe(sourceChunks);
    expect(sourceDelete?.table).toBe(sources);
    expect(fake.recorded.deletes).toHaveLength(3);
  });

  it('recovers an existing cancelling claim by repeating storage and DB cleanup', async () => {
    // A storage success followed by a DB failure left the pair at
    // `cancelling`: the repeated cancel accepts the existing claim, skips the
    // claim UPDATE entirely and re-runs the destructive cleanup.
    fake.results.push(
      [sourceRow],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'cancelling' }],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'cancelling' }],
      [],
      [{ value: 0 }],
      [],
      [],
    );

    await cancelSourceUpload(USER_ID, SOURCE_ID);

    expect(fake.recorded.updates).toHaveLength(0);
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObject).toHaveBeenCalledWith(PDF_KEY);
    const [unbookDelete, chunkDelete, sourceDelete] = fake.recorded.deletes;
    expect(unbookDelete?.table).toBe(unbooks);
    expect(chunkDelete?.table).toBe(sourceChunks);
    expect(sourceDelete?.table).toBe(sources);
    expect(fake.recorded.deletes).toHaveLength(3);
    expect(mocks.sendDeleted).toHaveBeenCalledWith({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
    });
  });

  it('treats missing rows as idempotent success without touching storage', async () => {
    fake.results.push([]);

    await cancelSourceUpload(USER_ID, SOURCE_ID);

    expect(fake.recorded.transactionCount).toBe(0);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.sendDeleted).not.toHaveBeenCalled();
    expect(fake.recorded.deletes).toHaveLength(0);
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
    // The successful retry reset already flipped the source back to
    // `uploaded`; markQueueFailed only acts on that reset state.
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID, status: 'failed' }],
      [failedSource],
      [{ id: USER_ID }],
      [failedSource],
      [{ id: UNBOOK_ID }],
      [],
      [{ ...failedSource, status: 'uploaded', errorCode: null }],
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
    // Same claim queries as the happy path (claim marker commits first), then
    // the restoration transaction: source lock, locked unbook still at
    // `deleting`, guarded update. A running ingest stage becomes a safe
    // retryable failed state instead of a misleading restored stage.
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID }],
      [sourceRow],
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID, status: 'queued', currentStage: 'reading' }],
      [{ id: UNBOOK_ID }],
      [{ value: 0 }],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'deleting' }],
      [],
    );
    mocks.deleteObject.mockRejectedValue(new SourceError('storageUnavailable'));

    await expect(deleteOwnedUnbook(USER_ID, UNBOOK_ID)).rejects.toMatchObject({
      code: 'storageUnavailable',
    });

    // The claim transaction AND the restoration transaction both committed.
    expect(fake.recorded.transactionCount).toBe(2);
    expect(fake.recorded.updates.map((entry) => entry.set)).toEqual([
      { currentStage: 'deleting' },
      { status: 'failed', currentStage: 'failed' },
    ]);
    expect(fake.recorded.deletes).toHaveLength(0);
    expect(mocks.sendDeleted).not.toHaveBeenCalled();
  });

  it('claims `deleting` first, then deletes storage, unbook, chunks and the unshared source', async () => {
    // Claim tx: initial read, source lock, locked unbook (queued/reading),
    // claim update, shared-ref count. THEN storage. Cleanup tx: source lock,
    // locked unbook (deleting), unbook delete, ref count, chunk + source
    // delete.
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID }],
      [sourceRow],
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID, status: 'queued', currentStage: 'reading' }],
      [{ id: UNBOOK_ID }],
      [{ value: 0 }],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'deleting' }],
      [],
      [{ value: 0 }],
      [],
      [],
    );

    await deleteOwnedUnbook(USER_ID, UNBOOK_ID);

    expect(mocks.deleteObject).toHaveBeenCalledWith(PDF_KEY);
    // The claim UPDATE commits BEFORE the storage delete; the storage delete
    // happens BEFORE the first DB DELETE (the unbook row).
    expect(fake.recorded.updates).toHaveLength(1);
    expect(fake.recorded.updates[0]?.table).toBe(unbooks);
    expect(fake.recorded.updates[0]?.set).toEqual({ currentStage: 'deleting' });
    const claimOrder = fake.db.update.mock.invocationCallOrder[0] ?? 0;
    const storageOrder = mocks.deleteObject.mock.invocationCallOrder[0] ?? 0;
    const unbookDeleteOrder = fake.db.delete.mock.invocationCallOrder[0] ?? 0;
    expect(claimOrder).toBeLessThan(storageOrder);
    expect(storageOrder).toBeLessThan(unbookDeleteOrder);

    expect(fake.recorded.selects[1]).toMatchObject({ table: sources, forUpdate: true });
    expect(fake.recorded.selects[2]).toMatchObject({ table: unbooks, forUpdate: true });
    expect(fake.recorded.selects[4]).toMatchObject({ table: sources, forUpdate: true });
    expect(fake.recorded.selects[5]).toMatchObject({ table: unbooks, forUpdate: true });

    const [unbookDelete, chunkDelete, sourceDelete] = fake.recorded.deletes;
    expect(unbookDelete?.table).toBe(unbooks);
    expect(chunkDelete?.table).toBe(sourceChunks);
    expect(sourceDelete?.table).toBe(sources);
    expect(fake.recorded.deletes).toHaveLength(3);
    expect(mocks.sendDeleted).toHaveBeenCalledWith({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
    });
  });

  it('never touches a shared source, its chunks or its file', async () => {
    // Two other Unbooks still reference the source: no fileKey is claimed, no
    // storage delete happens and the cleanup ref count stays above zero.
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID }],
      [sourceRow],
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID, status: 'ready', currentStage: 'ready' }],
      [{ id: UNBOOK_ID }],
      [{ value: 2 }],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'deleting' }],
      [],
      [{ value: 2 }],
    );

    await deleteOwnedUnbook(USER_ID, UNBOOK_ID);

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(fake.recorded.deletes).toHaveLength(1);
    expect(fake.recorded.deletes[0]?.table).toBe(unbooks);
    expect(fake.recorded.updates.map((entry) => entry.set)).toEqual([{ currentStage: 'deleting' }]);
    // A shared source survives for the other referencing Unbooks, so the
    // deletion must never emit `source/deleted` (their inngest cancelOn
    // matches on sourceId + userId and would cancel their live runs).
    expect(mocks.sendDeleted).not.toHaveBeenCalled();
  });

  it('deletes only the unbook when it has no source', async () => {
    // No source lock, no shared-ref count, no storage, no source cleanup:
    // the claim + cleanup transactions only move the source-less Unbook.
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: null }],
      [{ id: UNBOOK_ID, sourceId: null, status: 'ready', currentStage: 'ready' }],
      [{ id: UNBOOK_ID }],
      [{ id: UNBOOK_ID, currentStage: 'deleting' }],
      [],
    );

    await deleteOwnedUnbook(USER_ID, UNBOOK_ID);

    expect(fake.recorded.deletes).toHaveLength(1);
    expect(fake.recorded.deletes[0]?.table).toBe(unbooks);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(fake.recorded.selects.some((entry) => entry.table === sources)).toBe(false);
    expect(fake.recorded.updates.map((entry) => entry.set)).toEqual([{ currentStage: 'deleting' }]);
  });

  it('recovers an existing deleting claim by repeating storage and cleanup idempotently', async () => {
    // A storage success followed by a DB failure left the marker at
    // `deleting`: the repeated delete skips the claim UPDATE and re-runs the
    // destructive cleanup under the same ownership locks.
    fake.results.push(
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID }],
      [sourceRow],
      [{ id: UNBOOK_ID, sourceId: SOURCE_ID, status: 'queued', currentStage: 'deleting' }],
      [{ value: 0 }],
      [sourceRow],
      [{ id: UNBOOK_ID, currentStage: 'deleting' }],
      [],
      [{ value: 0 }],
      [],
      [],
    );

    await deleteOwnedUnbook(USER_ID, UNBOOK_ID);

    expect(fake.recorded.updates).toHaveLength(0);
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObject).toHaveBeenCalledWith(PDF_KEY);
    expect(fake.recorded.selects[1]).toMatchObject({ table: sources, forUpdate: true });
    expect(fake.recorded.selects[2]).toMatchObject({ table: unbooks, forUpdate: true });
    const [unbookDelete, chunkDelete, sourceDelete] = fake.recorded.deletes;
    expect(unbookDelete?.table).toBe(unbooks);
    expect(chunkDelete?.table).toBe(sourceChunks);
    expect(sourceDelete?.table).toBe(sources);
    expect(fake.recorded.deletes).toHaveLength(3);
    expect(mocks.sendDeleted).toHaveBeenCalledWith({
      sourceId: SOURCE_ID,
      userId: USER_ID,
      unbookId: UNBOOK_ID,
    });
  });
});
