import 'server-only';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { interests, sources, unbooks, users } from '@/db/schema';
import type { NewUnbook } from '@/db/schema';
import { getSourceAllowance, validateSourceFileSize } from '@/lib/billing/source-quota';
import { SourceError } from '@/lib/sources/errors';
import { SOURCE_FILE_MIME_TYPES, resolveSourceFileType } from './schema';
import type { SourceFileUploadInput } from './schema';
import { sendSourceUploaded } from '@/inngest/events';
import { createSourceObjectKey } from '@/lib/storage/keys';
import { createSourceUploadUrl, deleteSourceObject, putSourceText } from '@/lib/storage';

/**
 * Source rows are created here, together with their queued Unbook, inside ONE
 * transaction so pending work reserves plan capacity without writing usage
 * counters (quota is charged only when an Unbook finishes, PRD 7.5).
 *
 * Locking order (the ingest integration must follow the same order):
 * 1. Capacity flows lock the user's `users` row (`FOR UPDATE`) first, then run
 *    `getSourceAllowance(..., { database: tx })` inside that transaction.
 * 2. Every other flow locks the owned `sources` row (`FOR UPDATE`) first.
 * `unbooks` rows are only read/written after the `sources` lock is held.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PreparedUpload = {
  sourceId: string;
  unbookId: string;
  uploadUrl: string;
  mimeType: string;
};

async function lockUserRow(tx: Transaction, userId: string): Promise<void> {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
}

async function resolveActiveInterest(tx: Transaction, slug: string): Promise<string> {
  const [interest] = await tx
    .select({ id: interests.id })
    .from(interests)
    .where(and(eq(interests.slug, slug), eq(interests.isActive, true)))
    .limit(1);
  if (!interest) throw new SourceError('invalidInput');
  return interest.id;
}

/**
 * E2-01 AC3: create the source + queued Unbook and sign the upload URL. The
 * URL is signed BEFORE any reservation: a signing failure leaves no rows, and
 * signing never exposes credentials. There is no network call inside the
 * transaction; a quota/size failure after signing simply discards the unused
 * short-lived URL.
 */
export async function prepareFileSource(
  userId: string,
  input: SourceFileUploadInput,
): Promise<PreparedUpload> {
  const fileType = resolveSourceFileType(input.filename, input.mimeType);
  if (!fileType) throw new SourceError('fileType');

  const sourceId = randomUUID();
  const mimeType = SOURCE_FILE_MIME_TYPES[fileType];

  const signed = await createSourceUploadUrl({
    userId,
    sourceId,
    type: fileType,
    mimeType,
    sizeBytes: input.sizeBytes,
  });

  const unbookId = await db.transaction(async (tx) => {
    await lockUserRow(tx, userId);
    const now = new Date();
    const allowance = await getSourceAllowance(userId, now, { database: tx });
    validateSourceFileSize(allowance.limits, input.sizeBytes);
    if (allowance.remaining < 1) throw new SourceError('quotaExceeded');
    const interestId = await resolveActiveInterest(tx, input.interestSlug);

    await tx.insert(sources).values({
      id: sourceId,
      userId,
      type: fileType,
      title: input.title,
      fileKey: signed.fileKey,
      mimeType,
      sizeBytes: input.sizeBytes,
      status: 'uploaded',
      rightsConfirmedAt: now,
    });
    const [unbook] = await tx
      .insert(unbooks)
      .values({
        userId,
        sourceId,
        interestId,
        title: input.title,
        status: 'queued',
        currentStage: 'uploading',
        progressPct: 0,
        usedByok: false,
      } satisfies NewUnbook)
      .returning({ id: unbooks.id });
    if (!unbook) throw new SourceError('processingFailed');
    return unbook.id;
  });

  return { sourceId, unbookId, uploadUrl: signed.uploadUrl, mimeType };
}

/** Queue failure leaves a safe, retryable failed state, never a stuck queue. */
export async function markQueueFailed(
  userId: string,
  sourceId: string,
  unbookId: string,
  code: 'jobsUnavailable',
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(sources)
      .set({ status: 'failed', errorCode: code })
      .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)));
    await tx
      .update(unbooks)
      .set({ status: 'failed', currentStage: 'failed' })
      .where(and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId)));
  });
}

export type InlineSourceInput = {
  title: string;
  interestSlug: string;
  text?: string;
  url?: string;
};

/**
 * Text and URL sources have their content (or validated URL) already, so they
 * are queued for processing immediately: the Unbook starts at stage `reading`
 * and the `source/uploaded` event is sent after the reservation commits.
 *
 * Text content lives in its own `source.txt` object, written before any row
 * exists; if the reservation then fails the object is deleted (compensation),
 * so a failed request never reserves capacity nor leaves an unowned file.
 */
export async function createInlineSource(
  userId: string,
  input: InlineSourceInput,
): Promise<{ sourceId: string; unbookId: string }> {
  const isText = input.text !== undefined;
  const sourceType: 'text' | 'url' = isText ? 'text' : 'url';
  const sourceId = randomUUID();

  let fileKey: string | null = null;
  let sizeBytes: number | null = null;

  if (input.text !== undefined) {
    fileKey = createSourceObjectKey(userId, sourceId, 'text');
    sizeBytes = new TextEncoder().encode(input.text).byteLength;
    await putSourceText(fileKey, input.text);
  }

  try {
    const unbookId = await db.transaction(async (tx) => {
      await lockUserRow(tx, userId);
      const now = new Date();
      const allowance = await getSourceAllowance(userId, now, { database: tx });
      if (sizeBytes !== null) validateSourceFileSize(allowance.limits, sizeBytes);
      if (allowance.remaining < 1) throw new SourceError('quotaExceeded');
      const interestId = await resolveActiveInterest(tx, input.interestSlug);

      await tx.insert(sources).values({
        id: sourceId,
        userId,
        type: sourceType,
        title: input.title,
        fileKey,
        url: input.url ?? null,
        mimeType: isText ? 'text/plain' : null,
        sizeBytes,
        status: 'uploaded',
        rightsConfirmedAt: now,
      });
      const [unbook] = await tx
        .insert(unbooks)
        .values({
          userId,
          sourceId,
          interestId,
          title: input.title,
          status: 'queued',
          currentStage: 'reading',
          progressPct: 0,
          usedByok: false,
        } satisfies NewUnbook)
        .returning({ id: unbooks.id });
      if (!unbook) throw new SourceError('processingFailed');
      return unbook.id;
    });

    try {
      await sendSourceUploaded({ sourceId, userId, unbookId });
    } catch {
      await markQueueFailed(userId, sourceId, unbookId, 'jobsUnavailable');
      throw new SourceError('jobsUnavailable');
    }

    return { sourceId, unbookId };
  } catch (error) {
    if (fileKey) {
      try {
        await deleteSourceObject(fileKey);
      } catch {
        // Best effort: the object is unreferenced without a committed row.
      }
    }
    throw error;
  }
}
