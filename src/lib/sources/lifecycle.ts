import 'server-only';
import { randomUUID } from 'crypto';
import { and, count, eq, isNull, ne, or } from 'drizzle-orm';
import { db } from '@/db';
import { sourceChunks, sources, unbooks, users } from '@/db/schema';
import type { Unbook } from '@/db/schema';
import { getSourceAllowance, validateSourceFileSize } from '@/lib/billing/source-quota';
import { SourceError } from '@/lib/sources/errors';
import { isOwnedSourceObjectKey } from '@/lib/storage/keys';
import { deleteSourceObject, headSourceObject } from '@/lib/storage';
import { sendSourceDeleted, sendSourceUploaded, sendUnbookRequested } from '@/inngest/events';
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
 * storage (HEAD) against the stored metadata - the MIME type, the EXACT
 * `sizeBytes` recorded at presign time (a swapped/different file is rejected
 * even when its size sits below the plan limit) and the CURRENT plan limits -
 * then claim the state transition `uploading -> reading` with a guarded UPDATE
 * so repeated or concurrent completions cannot double-queue a job. A source
 * claimed by cancellation (`cancelling`) is never treated as a submitted
 * success: no event is sent for it. The `source/uploaded` event is sent only
 * after the transition commits; a queued send failure marks the flow failed so
 * the user can retry explicitly.
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
  // Integrity: the uploaded object must be the very file that was signed.
  if (source.sizeBytes !== null && actual.sizeBytes !== source.sizeBytes) {
    throw new SourceError('invalidInput');
  }
  const allowance = await getSourceAllowance(userId);
  validateSourceFileSize(allowance.limits, actual.sizeBytes);

  const unbookId = await db.transaction(async (tx) => {
    const locked = await lockOwnedSource(tx, userId, sourceId);
    if (!locked) throw new SourceError('notFound');

    const [unbook] = await tx
      .select({ id: unbooks.id, currentStage: unbooks.currentStage })
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

    // Cancellation/deletion won the race: never report success for a pair that
    // is being torn down and never enqueue a job for it.
    if (!claimed && (unbook.currentStage === 'cancelling' || unbook.currentStage === 'deleting')) {
      throw new SourceError('invalidInput');
    }

    if (claimed) {
      await tx
        .update(sources)
        .set({ mimeType: actual.mimeType, sizeBytes: actual.sizeBytes })
        .where(
          and(eq(sources.id, sourceId), eq(sources.userId, userId), eq(sources.status, 'uploaded')),
        );
    }

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
 * Cancel a pending upload. The claim (`cancelling`) is committed under the
 * owned source + Unbook locks BEFORE any storage call, so a concurrent
 * finalize can never enqueue a job for a pair being torn down. A repeated
 * cancel accepts an existing `cancelling` claim (recovery after a storage
 * success followed by a DB failure), while a pair claimed by deletion is
 * rejected. Missing rows are idempotent success. No transaction spans the
 * storage call.
 */
export async function cancelSourceUpload(userId: string, sourceId: string): Promise<void> {
  const source = await loadOwnedSource(userId, sourceId);
  // Already gone: nothing destructive remains.
  if (!source) return;

  if (source.fileKey && !isOwnedSourceObjectKey(source.fileKey, userId, sourceId)) {
    throw new SourceError('invalidInput');
  }

  const claim = await db.transaction(async (tx) => {
    const locked = await lockOwnedSource(tx, userId, sourceId);
    if (!locked) return null;

    const [unbook] = await tx
      .select({ id: unbooks.id, currentStage: unbooks.currentStage })
      .from(unbooks)
      .where(and(eq(unbooks.sourceId, sourceId), eq(unbooks.userId, userId)))
      .for('update');
    if (!unbook) return null;

    if (unbook.currentStage === 'deleting') throw new SourceError('invalidInput');

    if (unbook.currentStage !== 'cancelling') {
      if (unbook.currentStage !== 'uploading') throw new SourceError('invalidInput');
      const [claimed] = await tx
        .update(unbooks)
        .set({ currentStage: 'cancelling' })
        .where(
          and(
            eq(unbooks.id, unbook.id),
            eq(unbooks.userId, userId),
            eq(unbooks.sourceId, sourceId),
            eq(unbooks.currentStage, 'uploading'),
            eq(unbooks.status, 'queued'),
          ),
        )
        .returning({ id: unbooks.id });
      if (!claimed) throw new SourceError('invalidInput');
    }

    return { unbookId: unbook.id, fileKey: locked.fileKey ?? null };
  });

  if (claim === null) return;

  if (claim.fileKey) {
    try {
      await deleteSourceObject(claim.fileKey);
    } catch (error) {
      await restoreUploadableStage(userId, sourceId);
      throw error;
    }
  }

  await db.transaction(async (tx) => {
    const locked = await lockOwnedSource(tx, userId, sourceId);
    if (!locked) return;

    const [unbook] = await tx
      .select({ id: unbooks.id, currentStage: unbooks.currentStage })
      .from(unbooks)
      .where(
        and(
          eq(unbooks.id, claim.unbookId),
          eq(unbooks.userId, userId),
          eq(unbooks.sourceId, sourceId),
        ),
      )
      .for('update');

    if (unbook && unbook.currentStage !== 'cancelling') return;

    if (unbook) {
      await tx
        .delete(unbooks)
        .where(and(eq(unbooks.id, claim.unbookId), eq(unbooks.userId, userId)));
    }
    const refs = await countSourceRefsInTx(tx, sourceId);
    if (refs === 0) {
      await tx.delete(sourceChunks).where(eq(sourceChunks.sourceId, sourceId));
      await tx.delete(sources).where(and(eq(sources.id, sourceId), eq(sources.userId, userId)));
    }
  });

  try {
    await sendSourceDeleted({ sourceId, userId, unbookId: claim.unbookId });
  } catch {
    // Best effort: the data is already gone.
  }
}

/**
 * Restore the uploadable state after a failed storage deletion (guarded to the
 * exact `cancelling` claim). Best effort: the original storage error is the
 * one surfaced to the caller.
 */
async function restoreUploadableStage(userId: string, sourceId: string): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(unbooks)
        .set({ currentStage: 'uploading' })
        .where(
          and(
            eq(unbooks.sourceId, sourceId),
            eq(unbooks.userId, userId),
            eq(unbooks.status, 'queued'),
            eq(unbooks.currentStage, 'cancelling'),
          ),
        );
    });
  } catch {
    // Intentionally ignored: the storage error is reported instead.
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

  const generationRetry = await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');

    const allowance = await getSourceAllowance(userId, new Date(), {
      database: tx,
      excludeUnbookId: unbookId,
    });
    if (allowance.remaining < 1) throw new SourceError('quotaExceeded');

    const locked = await lockOwnedSource(tx, userId, sourceId);
    if (!locked) throw new SourceError('notFound');

    const generationFailed = locked.status === 'ready' && !locked.errorCode;
    const [stillFailed] = await tx
      .update(unbooks)
      .set({
        status: 'queued',
        currentStage: generationFailed ? 'ingested' : 'reading',
        progressPct: generationFailed ? 100 : 0,
      })
      .where(
        and(
          eq(unbooks.id, unbookId),
          eq(unbooks.userId, userId),
          eq(unbooks.sourceId, sourceId),
          eq(unbooks.status, 'failed'),
          or(
            isNull(unbooks.currentStage),
            and(ne(unbooks.currentStage, 'deleting'), ne(unbooks.currentStage, 'cancelling')),
          ),
        ),
      )
      .returning({ id: unbooks.id });
    if (!stillFailed) throw new SourceError('invalidInput');

    if (locked.status === 'failed') {
      await tx
        .update(sources)
        .set({ status: 'uploaded', errorCode: null })
        .where(eq(sources.id, sourceId));
    }
    return generationFailed;
  });

  try {
    if (generationRetry) {
      await sendUnbookRequested(
        { sourceId, userId, unbookId },
        { eventId: `unbook-requested-retry:${unbookId}:${randomUUID()}` },
      );
    } else {
      await sendSourceUploaded(
        { sourceId, userId, unbookId },
        { eventId: `source-uploaded-retry:${unbookId}:${randomUUID()}` },
      );
    }
  } catch {
    if (generationRetry) {
      // A late failed acknowledgement must not regress a job already running,
      // ready, or claimed for deletion. Keep the ready source retryable.
      await db.transaction(async (tx) => {
        const locked = await lockOwnedSource(tx, userId, sourceId);
        if (!locked || locked.status !== 'ready' || locked.errorCode) return;
        await tx
          .update(unbooks)
          .set({ status: 'failed', currentStage: 'failed' })
          .where(
            and(
              eq(unbooks.id, unbookId),
              eq(unbooks.userId, userId),
              eq(unbooks.sourceId, sourceId),
              eq(unbooks.status, 'queued'),
              eq(unbooks.currentStage, 'ingested'),
            ),
          );
      });
    } else {
      await markQueueFailed(userId, sourceId, unbookId, 'jobsUnavailable');
    }
    throw new SourceError('jobsUnavailable');
  }
}

/**
 * Delete one owned Unbook (E2-03 AC3).
 *
 * Storage is deleted FIRST so a storage failure preserves every DB reference.
 * A `deleting` claim is committed under the owned `sources` + `unbooks` locks
 * BEFORE the storage call, so an ingest service can never write after the
 * snapshot and a repeated delete can recover a DB failure that happened after
 * the object was already gone. The object is deleted only when this Unbook is
 * the last reference; shared sources and source-less personal originals are
 * preserved. The `source/deleted` event is emitted only when the cleanup
 * transaction actually deleted the last-reference owned source, so a shared
 * source never cancels another Unbook's still-running ingest. Missing rows are
 * a safe notFound; an already-missing object is idempotent success.
 */
export async function deleteOwnedUnbook(userId: string, unbookId: string): Promise<void> {
  const [unbook] = await db
    .select({ id: unbooks.id, sourceId: unbooks.sourceId })
    .from(unbooks)
    .where(and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId)))
    .limit(1);
  if (!unbook) throw new SourceError('notFound');

  const claim = await db.transaction(async (tx) => {
    let source = null;
    if (unbook.sourceId !== null) {
      source = await lockOwnedSource(tx, userId, unbook.sourceId);
    }

    const [lockedUnbook] = await tx
      .select({
        id: unbooks.id,
        sourceId: unbooks.sourceId,
        status: unbooks.status,
        currentStage: unbooks.currentStage,
      })
      .from(unbooks)
      .where(and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId)))
      .for('update');
    if (!lockedUnbook) return null;

    const previousStage = lockedUnbook.currentStage;
    if (previousStage !== 'deleting') {
      const [claimed] = await tx
        .update(unbooks)
        .set({ currentStage: 'deleting' })
        .where(and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId)))
        .returning({ id: unbooks.id });
      if (!claimed) return null;
    }

    const sourceId = lockedUnbook.sourceId;
    const sharedRefs = sourceId !== null ? await countOtherRefsInTx(tx, sourceId, unbookId) : 0;
    const fileKey = source && sharedRefs === 0 ? (source.fileKey ?? null) : null;

    return {
      unbookId,
      sourceId,
      fileKey,
      previousStatus: lockedUnbook.status,
      previousStage,
    };
  });

  if (claim === null) return;

  if (claim.fileKey) {
    if (!isOwnedSourceObjectKey(claim.fileKey, userId, claim.sourceId ?? '')) {
      throw new SourceError('invalidInput');
    }
    try {
      await deleteSourceObject(claim.fileKey);
    } catch (error) {
      await restoreAfterDeleteStorageFailure(userId, claim);
      throw error;
    }
  }

  const sourceDeleted = await db.transaction(async (tx) => {
    const lockedSource =
      claim.sourceId !== null ? await lockOwnedSource(tx, userId, claim.sourceId) : null;

    const [lockedUnbook] = await tx
      .select({ id: unbooks.id, currentStage: unbooks.currentStage })
      .from(unbooks)
      .where(and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId)))
      .for('update');
    if (!lockedUnbook) return false;
    if (lockedUnbook.currentStage !== 'deleting') return false;

    await tx.delete(unbooks).where(and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId)));

    if (claim.sourceId !== null && lockedSource) {
      const refsNow = await countSourceRefsInTx(tx, claim.sourceId);
      if (refsNow === 0) {
        await tx.delete(sourceChunks).where(eq(sourceChunks.sourceId, claim.sourceId));
        await tx
          .delete(sources)
          .where(and(eq(sources.id, claim.sourceId), eq(sources.userId, userId)));
        return true;
      }
    }
    return false;
  });

  // `source/deleted` means the source itself is gone. A shared source (or a
  // not-owned/missing one) survives for the other referencing Unbooks, whose
  // own inngest runs must NOT be cancelled by this deletion.
  if (sourceDeleted && claim.sourceId !== null) {
    try {
      await sendSourceDeleted({ sourceId: claim.sourceId, userId, unbookId });
    } catch {
      // Best effort: the data is already gone.
    }
  }
}

type DeleteClaim = {
  unbookId: string;
  sourceId: string | null;
  fileKey: string | null;
  previousStatus: Unbook['status'];
  previousStage: string | null;
};

/**
 * A storage failure keeps every DB reference. Restoring a running ingest stage
 * would be misleading because the job may have exited when it observed the
 * `deleting` claim, so unfinished ingest flows become a safe retryable failed
 * state; terminal/uploading states are restored exactly.
 */
async function restoreAfterDeleteStorageFailure(userId: string, claim: DeleteClaim): Promise<void> {
  const running = new Set(['reading', 'chunking', 'embedding']);
  try {
    await db.transaction(async (tx) => {
      if (claim.sourceId !== null) await lockOwnedSource(tx, userId, claim.sourceId);
      const [lockedUnbook] = await tx
        .select({ id: unbooks.id, currentStage: unbooks.currentStage })
        .from(unbooks)
        .where(and(eq(unbooks.id, claim.unbookId), eq(unbooks.userId, userId)))
        .for('update');
      if (!lockedUnbook || lockedUnbook.currentStage !== 'deleting') return;

      if (claim.previousStage !== null && running.has(claim.previousStage)) {
        await tx
          .update(unbooks)
          .set({ status: 'failed', currentStage: 'failed' })
          .where(and(eq(unbooks.id, claim.unbookId), eq(unbooks.userId, userId)));
        return;
      }

      await tx
        .update(unbooks)
        .set({ status: claim.previousStatus, currentStage: claim.previousStage })
        .where(and(eq(unbooks.id, claim.unbookId), eq(unbooks.userId, userId)));
    });
  } catch {
    // Intentionally ignored: the storage error is reported instead.
  }
}

function countOtherRefsInTx(tx: Transaction, sourceId: string, unbookId: string) {
  return tx
    .select({ value: count() })
    .from(unbooks)
    .where(and(eq(unbooks.sourceId, sourceId), ne(unbooks.id, unbookId)))
    .then((rows) => Number(rows[0]?.value ?? 0));
}

function countSourceRefsInTx(tx: Transaction, sourceId: string) {
  return tx
    .select({ value: count() })
    .from(unbooks)
    .where(eq(unbooks.sourceId, sourceId))
    .then((rows) => Number(rows[0]?.value ?? 0));
}
