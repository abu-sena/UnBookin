import 'server-only';
import { z } from 'zod';
import { SourceError } from '@/lib/sources/errors';
import { inngest } from './client';

/** Event names emitted by the source flows. Consumed by the ingest functions. */
export const SOURCE_UPLOADED_EVENT = 'source/uploaded';
export const SOURCE_DELETED_EVENT = 'source/deleted';

/**
 * Event payloads carry IDs only. Source text, file keys, URLs and vendor error
 * detail never enter the event stream (or Inngest SDK logs).
 */
export const sourceUploadedDataSchema = z.strictObject({
  sourceId: z.uuid(),
  userId: z.uuid(),
  unbookId: z.uuid(),
});
export const sourceDeletedDataSchema = sourceUploadedDataSchema;

export type SourceUploadedData = z.infer<typeof sourceUploadedDataSchema>;
export type SourceDeletedData = z.infer<typeof sourceDeletedDataSchema>;

/**
 * Guard so a missing Inngest configuration fails loudly instead of silently
 * dropping events: the SDK's dev mode returns `ids: []` without an event key,
 * and cloud sends fail signature verification without a signing key — either
 * way Unbooks would be queued forever.
 *
 * - Production requires BOTH `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`
 *   (trim non-empty); `INNGEST_DEV` can never bypass this.
 * - Local development requires an explicit `INNGEST_DEV=1` (or `true`).
 */
function assertJobsConfigured(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const eventKey = process.env.INNGEST_EVENT_KEY?.trim();
  const signingKey = process.env.INNGEST_SIGNING_KEY?.trim();
  const devFlag = process.env.INNGEST_DEV?.trim().toLowerCase();

  if (isProduction) {
    if (!eventKey || !signingKey) throw new SourceError('jobsUnavailable');
    return;
  }
  if (devFlag !== '1' && devFlag !== 'true') throw new SourceError('jobsUnavailable');
}

async function sendSourceEvent(
  eventName: string,
  data: unknown,
  eventId: string,
  schema: z.ZodType<SourceUploadedData | SourceDeletedData>,
): Promise<void> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new SourceError('invalidInput');

  assertJobsConfigured();
  try {
    const receipt: unknown = await inngest.send({
      name: eventName,
      data: parsed.data,
      id: eventId,
    });
    // The SDK can RESOLVE with an empty receipt (unconfigured/offline dev
    // fallback returns `ids: []`). Only a receipt with at least one event id
    // counts as delivered; anything else is a recoverable failure so sources
    // are never left queued forever.
    const ids = (receipt as { ids?: unknown } | null | undefined)?.ids;
    const delivered =
      Array.isArray(ids) && ids.some((id) => typeof id === 'string' && id.length > 0);
    if (!delivered) throw new SourceError('jobsUnavailable');
  } catch (error) {
    // Never surface vendor/network detail; the caller maps this to a safe,
    // retryable failed state.
    void error;
    throw new SourceError('jobsUnavailable');
  }
}

/**
 * Emit `source/uploaded` after an owned source + queued Unbook exist.
 *
 * - `{ eventId }` defaults to the stable id `source-uploaded:{sourceId}` so a
 *   repeated initial finalize cannot enqueue the job twice.
 * - An explicit retry must pass a distinct, unique `eventId`.
 * - Throws safe codes only: `invalidInput` (bad DTO) or `jobsUnavailable`
 *   (not configured / send failed). Callers mark the Unbook failed so the user
 *   can retry explicitly.
 */
export async function sendSourceUploaded(
  data: SourceUploadedData,
  options: { eventId?: string } = {},
): Promise<void> {
  const eventId = options.eventId?.trim() || `source-uploaded:${data.sourceId}`;
  if (!z.uuid().safeParse(data.sourceId).success) throw new SourceError('invalidInput');
  await sendSourceEvent(SOURCE_UPLOADED_EVENT, data, eventId, sourceUploadedDataSchema);
}

/**
 * Emit `source/deleted` as a best-effort cancellation signal for jobs that may
 * already be running. The ingest side must verify row existence before any
 * pipeline write; a failed send here is never reported to the user after the
 * data is already gone.
 */
export async function sendSourceDeleted(
  data: SourceDeletedData,
  options: { eventId?: string } = {},
): Promise<void> {
  const eventId = options.eventId?.trim() || `source-deleted:${data.sourceId}`;
  if (!z.uuid().safeParse(data.sourceId).success) throw new SourceError('invalidInput');
  await sendSourceEvent(SOURCE_DELETED_EVENT, data, eventId, sourceDeletedDataSchema);
}
