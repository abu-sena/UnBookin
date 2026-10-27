import 'server-only';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { interests, modules, sourceChunks, sources, unbooks } from '@/db/schema';
import { getSourceAllowance } from '@/lib/billing/source-quota';
import { requireUser } from '@/lib/auth/session';
import { isSourceErrorCode, type SourceErrorCode } from './errors';
import {
  SOURCE_PROGRESS_STAGES,
  type SourceProgress,
  type SourceProgressStage,
  type SourceUploadContext,
} from './types';
import { unbookIdSchema } from './schema';

/** Only the query surface is needed, which keeps tenant tests dependency-free. */
export type SourceQueryDatabase = Pick<typeof db, 'select'>;

/**
 * Parse a `current_stage` value written by any pipeline worker. Only the
 * controlled union is accepted; unknown strings return null and the stage is
 * re-derived from the row statuses instead.
 */
export function parseStoredStage(raw: string | null | undefined): SourceProgressStage | null {
  const value = raw?.trim();
  if (!value) return null;
  return (SOURCE_PROGRESS_STAGES as readonly string[]).includes(value)
    ? (value as SourceProgressStage)
    : null;
}

/**
 * Derive a controlled stage from the persisted statuses. TERMINAL statuses are
 * decided first so a stale (or still-running) `current_stage` can never make a
 * finished flow appear perpetually processing; a parseable nonterminal stage
 * then wins over the remaining enum statuses. Unknown stored strings are
 * re-derived from the statuses instead (privacy + correctness).
 */
export function deriveProgressStage(
  unbookStatus: SourceProgress['unbookStatus'],
  sourceStatus: SourceProgress['sourceStatus'],
  storedStage: string | null | undefined,
): SourceProgressStage {
  if (unbookStatus === 'ready') return 'ready';
  if (unbookStatus === 'failed' || sourceStatus === 'failed') return 'failed';
  const parsed = parseStoredStage(storedStage);
  if (parsed) return parsed;
  if (unbookStatus === 'outlining') return 'outlining';
  if (unbookStatus === 'generating') return 'generating';
  return 'reading';
}

/**
 * Stored `sources.error_code` values are written by this module and are safe
 * codes; a value written by anything else (or a future pipeline change) is
 * mapped to `processingFailed`, never shown raw.
 */
export function parseStoredErrorCode(raw: string | null | undefined): SourceErrorCode | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (!value) return null;
  return isSourceErrorCode(value) ? value : 'processingFailed';
}

async function loadUploadContext(userId: string): Promise<SourceUploadContext> {
  const [interestRows, allowance] = await Promise.all([
    db
      .select({ slug: interests.slug, name: interests.name })
      .from(interests)
      .where(eq(interests.isActive, true))
      .orderBy(asc(interests.sortOrder), asc(interests.name)),
    getSourceAllowance(userId),
  ]);
  return { interests: interestRows, allowance };
}

/** Upload sheet data for the signed-in user (E2-01 AC1/AC4). */
export async function getMyUploadContext(): Promise<SourceUploadContext> {
  const user = await requireUser('/library');
  return loadUploadContext(user.id);
}

/**
 * Internal helper taking the already-authenticated id; used by the safe server
 * action wrapper so the redirect is never inside its try/catch.
 */
export async function loadMyUploadContext(userId: string): Promise<SourceUploadContext> {
  return loadUploadContext(userId);
}

/**
 * Internal tenant-safe progress loader. Callers must pass the authenticated
 * server identity; a client-supplied id is never accepted.
 */
export async function loadSourceProgressForUser(
  userId: string,
  unbookId: string,
  database: SourceQueryDatabase = db,
): Promise<SourceProgress | null> {
  if (!unbookIdSchema.safeParse(unbookId).success) return null;

  const [row] = await database
    .select({
      unbookId: unbooks.id,
      title: unbooks.title,
      unbookStatus: unbooks.status,
      progressPct: unbooks.progressPct,
      currentStage: unbooks.currentStage,
      moduleCount: unbooks.moduleCount,
      modulesCompleted: sql<number>`(select count(*) from ${modules} where ${modules.unbookId} = ${unbooks.id} and ${modules.content} is not null and not (${modules.content} ? 'pending'))`.mapWith(Number),
      sourceId: sources.id,
      sourceStatus: sources.status,
      sourceErrorCode: sources.errorCode,
    })
    .from(unbooks)
    // The owner predicate repeats on the join so an Unbook can never surface
    // another user's source data.
    .leftJoin(sources, and(eq(unbooks.sourceId, sources.id), eq(sources.userId, userId)))
    // Authorization on the BASE row: the join predicate alone does not hide
    // another user's Unbook title/status/progress.
    .where(and(eq(unbooks.id, unbookId), eq(unbooks.userId, userId)))
    .limit(1);

  if (!row) return null;

  let totalChunks = 0;
  let embeddedChunks = 0;
  if (row.sourceId) {
    const [chunkRow] = await database
      .select({
        total: count(),
        embedded:
          sql<number>`count(${sourceChunks.id}) filter (where ${sourceChunks.embedding} is not null)`.mapWith(
            Number,
          ),
      })
      .from(sourceChunks)
      .where(eq(sourceChunks.sourceId, row.sourceId));
    totalChunks = Number(chunkRow?.total ?? 0);
    embeddedChunks = Number(chunkRow?.embedded ?? 0);
  }

  const failed = row.unbookStatus === 'failed' || row.sourceStatus === 'failed';

  return {
    unbookId: row.unbookId,
    title: row.title,
    sourceId: row.sourceId ?? null,
    sourceStatus: row.sourceStatus ?? null,
    unbookStatus: row.unbookStatus,
    stage: deriveProgressStage(row.unbookStatus, row.sourceStatus ?? null, row.currentStage),
    progressPct: row.progressPct,
    embeddedChunks,
    totalChunks,
    moduleCount: Number(row.moduleCount ?? 0),
    modulesCompleted: Number(row.modulesCompleted ?? 0),
    errorCode: failed
      ? (parseStoredErrorCode(row.sourceErrorCode) ??
        (row.unbookStatus === 'failed' && row.sourceStatus === 'ready'
          ? 'generationUnavailable'
          : null))
      : null,
  };
}

/** Authenticated server query; the identity comes only from the session. */
export async function getMySourceProgress(unbookId: string): Promise<SourceProgress | null> {
  const user = await requireUser('/library');
  return loadSourceProgressForUser(user.id, unbookId);
}
