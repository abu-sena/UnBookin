import 'server-only';
import { randomUUID } from 'crypto';
import { and, count, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { sourceChunks, sources, unbooks, users } from '@/db/schema';
import { getSourceAllowance, validateSourceFileSize } from '@/lib/billing/source-quota';
import { SourceError } from '@/lib/sources/errors';
import { isOwnedSourceObjectKey } from '@/lib/storage/keys';
import { deleteSourceObject, headSourceObject } from '@/lib/storage';
import { sendSourceDeleted, sendSourceUploaded } from '@/inngest/events';
import { markQueueFailed } from './store';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockOwnedSource(tx: Transaction, userId: string, sourceId: string) {
  const [source] = await tx
    .select()
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)))
    .for('update');
  return source ?? null;
}

async function loadOwnedSource(userId: string, sourceId: string) {
  const [source] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)))
    .limit(1);
  return source ?? null;
}

export type FinalizedUpload = { unbookId: string };

/**
 * Finalize a pending upload (E2-01 AC3): verify what actually landed in
 * storage (HEAD) against the stored metadata and the CURRENT plan limits, then
 * claim the state transition `uploading -> reading` with a guarded UPDATE so
 * repeated or concurrent completions cannot double-queue a job. The
 * `source/uploaded` event is sent only after the transition commits; a queued
 * send failure marks the flow failed so the user can retry explicitly.
 */
export async function finalizeSourceUpload(
  userId: string,
  sourceId: string,
): Promise<FinalizedUpload> {
  const source = await loadOwnedSource(userId, sourceId);
  if (!source) throw new SourceError('notFound');
  if (!source.fileKey) throw new SourceError('invalidInput');
  if (!isOwnedSourceObjectKey(source.fileKey, userId, sourceId)) {
    throw new SourceError('invalidInput');
  }

  // Network I/O happens before the transaction; nothing is held open.
  const actual = await headSourceObject(source.fileKey);
  if (source.mimeType && actual.mimeType.trim().toLowerCase() !== source.mimeType.toLowerCase()) {
    throw new SourceError('fileType');
  }
  const allowance = await getSourceAllowance(userId);
  validateSourceFileSize(allowance.limits, actual.sizeBytes);

  const unbookId = await db.transaction(async (tx) => {
    const locked = await lockOwnedSource(tx, userId, sourceId);
    if (!locked) throw new SourceError('notFound');

    const [unbook] = await tx
      .select({ id: unbooks.id })
      .from(unbooks)
      .where(and(eq(unbooks.sourceId, sourceId), eq(unbooks.userId, userId)))
      .limit(1);
    if (!unbook) throw new SourceError('notFound');

    // Only a source still at stage `uploading` transitions. A repeated or
    // already-submitted source updates zero rows and returns idempotent
    // success without sending another event.
    const [claimed] = await tx
      .update(unbooks)
      .set({ currentStage: 'reading' })
      .where(
        and(
          eq(unbooks.id, unbook.id),
          eq(unbooks.userId, userId),
          eq(unbooks.currentStage, 'uploading'),
          eq(unbooks.status, 'queued'),
        ),
      )
      .returning({ id: unbooks.id });

    await tx
      .update(sources)
      .set({ mimeType: actual.mimeType, sizeBytes: actual.sizeBytes })
      .where(eq(sources.id, sourceId));

    return claimed?.id ?? null;
  });

  if (unbookId === null) {
    // Already submitted (or already progressed/failed by the pipeline).
    const [unbook] = await db
      .select({ id: unbooks.id })
      .from(unbooks)
      .where(and(eq(unbooks.sourceId, sourceId), eq(unbooks.userId, userId)))
      .limit(1);
    if (!unbook) throw new SourceError('notFound');
    return { unbookId: unbook.id };
  }

  try {
    await sendSourceUploaded({ sourceId, userId, unbookId });
  } catch {
    await markQueueFailed(userId, sourceId, unbookId, 'jobsUnavailable');
    throw new SourceError('jobsUnavailable');
  }
  return { unbookId };
}

/**
 * Cancel a pending upload: allowed only while the source is still waiting for
 * the file (`queued` + stage `uploading`). The file is deleted first (a 404 is
 * success), then the owned Unbook, chunks and source rows are removed in one
 * transaction guarded by the `sources` row lock, so a successful finalize can
 * never race into an arbitrary delete of processing work. Cancelling after the
 * job was queued fails with a clear `invalidInput` instead of silently
 * deleting pipeline work. If storage is unavailable the DB references are kept
 * and the caller can retry the cancellation later.
 */
export async function cancelSourceUpload(userId: string, sourceId: string): Promise<void> {
  const source = await loadOwnedSource(userId, sourceId);
  if (!source) throw new SourceError('notFound');

  const [unbook] = await db
    .select({ id: unbooks.id, status: unbooks.status, currentStage: unbooks.currentStage })
    .from(unbooks)
    .where(and(eq(unbooks.sourceId, sourceId), eq(unbooks.userId, userId)))
    .limit(1);
  if (!unbook) throw new SourceError('notFound');
  const isPendingUpload = unbook.status === 'queued' && unbook.currentStage === 'uploading';
  if (!isPendingUpload) throw new SourceError('invalidInput');

  if (source.fileKey) {
    if (!isOwnedSourceObjectKey(source.fileKey, userId, sourceId)) {
      throw new SourceError('invalidInput');
    }
    // Missing object (never uploaded) is success; unavailable storage keeps
    // every DB reference so the cancel can be retried.
    await deleteSourceObject(source.fileKey);
  }

  await db.transaction(async (tx) => {
    const locked = await lockOwnedSource(tx, userId, sourceId);
    if (!locked) throw new SourceError('notFound');

    const [stillPending] = await tx
      .select({ id: unbooks.id })
      .from(unbooks)
      .where(
        and(
          eq(unbooks.id, unbook.id),
          eq(unbooks.userId, userId),
          eq(unbooks.currentStage, 'uploading'),
          eq(unbooks.status, 'queued'),
        ),
      )
      .for('update');
    if (!stillPending) throw new SourceError('invalidInput');

    // The source FK on `unbooks` is SET NULL, so the Unbook is deleted
    // explicitly; chunks are deleted explicitly as well for determinism.
    await tx.delete(unbooks).where(and(eq(unbooks.id, unbook.id), eq(unbooks.userId, userId)));
    await tx.delete(sourceChunks).where(eq(sourceChunks.sourceId, sourceId));
    await tx.delete(sources).where(and(eq(sources.id, sourceId), eq(sources.userId, userId)));
  });

  // Best-effort cancellation signal for jobs that may have started in a race
  // window. The ingest side must verify row existence before any write; a send
  // failure here is never reported after the data is already gone.
  try {
    await sendSourceDeleted({ sourceId, userId, unbookId: unbook.id });
  } catch {
    // Intentionally ignored.
  }
}

/**
 * Retry a failed source/unbook (E2-02 AC3). Only failed flows retry; the
 * capacity check is serialized by the user lock and excludes this same Unbook
 * (a failed job must not count itself as extra pending work). Quota usage is
 * never reset. Successful `source_chunks` (with embeddings) are preserved so
 * the ingest integration can reuse them. The event carries a DISTINCT id so
 * Inngest treats the retry as a new run.
 */
export async function retrySourceProcessing(userId: string, unbookId: string): Promise<void> {
  const [unbook] = await db
    .select({ id: unbooks.id, sourceId: unbooks.sourceId, status: unbooks.status })
    .from(unbooks)
    .where(and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId)))
    .limit(1);
  if (!unbook) throw new SourceError('notFound');
  if (unbook.status !== 'failed') throw new SourceError('invalidInput');
  if (!unbook.sourceId) throw new SourceError('notFound');
  const sourceId = unbook.sourceId;

  const source = await loadOwnedSource(userId, sourceId);
  if (!source) throw new SourceError('notFound');

  await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');

    const allowance = await getSourceAllowance(userId, new Date(), {
      database: tx,
      excludeUnbookId: unbookId,
    });
    if (allowance.remaining < 1) throw new SourceError('quotaExceeded');

    const locked = await lockOwnedSource(tx, userId, sourceId);
    if (!locked) throw new SourceError('notFound');

    const [stillFailed] = await tx
      .update(unbooks)
      .set({ status: 'queued', currentStage: 'reading', progressPct: 0 })
      .where(
        and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId), eq(unbooks.status, 'failed')),
      )
      .returning({ id: unbooks.id });
    if (!stillFailed) throw new SourceError('invalidInput');

    if (locked.status === 'failed') {
      await tx
        .update(sources)
        .set({ status: 'uploaded', errorCode: null })
        .where(eq(sources.id, sourceId));
    }
  });

  try {
    await sendSourceUploaded(
      { sourceId, userId, unbookId },
      { eventId: `source-uploaded-retry:${unbookId}:${randomUUID()}` },
    );
  } catch {
    await markQueueFailed(userId, sourceId, unbookId, 'jobsUnavailable');
    throw new SourceError('jobsUnavailable');
  }
}

/**
 * Delete one owned Unbook (E2-03 AC3). Storage is deleted FIRST so a storage
 * failure preserves every DB reference and the user can retry. The source row
 * (and its chunks/file) is only removed when no OTHER Unbook references it;
 * shared or foreign sources are never touched. Locking order: `sources` row
 * FOR UPDATE first, then `unbooks`/`source_chunks` deletes. Missing Unbook is
 * a safe notFound; an already-missing object is idempotent success.
 */
export async function deleteOwnedUnbook(userId: string, unbookId: string): Promise<void> {
  const [unbook] = await db
    .select({ id: unbooks.id, sourceId: unbooks.sourceId })
    .from(unbooks)
    .where(and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId)))
    .limit(1);
  if (!unbook) throw new SourceError('notFound');

  const source = unbook.sourceId !== null ? await loadOwnedSource(userId, unbook.sourceId) : null;
  const sharedRefs = unbook.sourceId !== null ? await countOtherRefs(unbook.sourceId, unbookId) : 0;

  if (source?.fileKey && sharedRefs === 0) {
    if (!isOwnedSourceObjectKey(source.fileKey, userId, source.id)) {
      throw new SourceError('invalidInput');
    }
    await deleteSourceObject(source.fileKey);
  }

  await db.transaction(async (tx) => {
    if (source) {
      const locked = await lockOwnedSource(tx, userId, source.id);
      if (!locked) throw new SourceError('notFound');
      const refsNow = await countOtherRefsInTx(tx, source.id, unbookId);
      if (refsNow === 0) {
        await tx.delete(sourceChunks).where(eq(sourceChunks.sourceId, source.id));
        await tx.delete(sources).where(and(eq(sources.id, source.id), eq(sources.userId, userId)));
      }
    }
    await tx.delete(unbooks).where(and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId)));
  });
}

async function countOtherRefs(sourceId: string, unbookId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(unbooks)
    .where(and(eq(unbooks.sourceId, sourceId), ne(unbooks.id, unbookId)));
  return Number(row?.value ?? 0);
}

function countOtherRefsInTx(tx: Transaction, sourceId: string, unbookId: string) {
  return tx
    .select({ value: count() })
    .from(unbooks)
    .where(and(eq(unbooks.sourceId, sourceId), ne(unbooks.id, unbookId)))
    .then((rows) => Number(rows[0]?.value ?? 0));
}
