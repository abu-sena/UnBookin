import 'server-only';
import { and, count, eq, gte, isNull, lt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { sourceChunks, sources, unbooks } from '@/db/schema';
import type { Source, Unbook } from '@/db/schema';
import { MAX_EMBEDDING_BATCH_SIZE, runTask } from '@/lib/ai/run-task';
import {
  getSourceAllowance,
  validateSourceFileSize,
  validateSourcePageCount,
} from '@/lib/billing/source-quota';
import type { PlanLimits } from '@/lib/billing/plan-limits';
import { chunkSource, type SourceChunkInput } from '@/lib/ingest/chunk';
import { extractSource, type ExtractedSource } from '@/lib/ingest/extract';
import {
  SourceError,
  isSourceErrorCode,
  toSourceErrorCode,
  type SourceErrorCode,
} from '@/lib/sources/errors';
import { createSourceObjectKey, isOwnedSourceObjectKey } from '@/lib/storage/keys';
import { deleteSourceObject, putSourceText, readSourceObject } from '@/lib/storage';

/**
 * PRIVATE durable ingest services (E2-01).
 *
 * These run INSIDE Inngest `step.run` callbacks, so every public boundary
 * converts any failure into a fresh, allowlisted `SourceError` BEFORE the SDK
 * can persist it. Results are metadata only: no source text, vectors, object
 * keys, URLs or vendor messages ever leave this module.
 *
 * Locking order matches the rest of the source flows: owned `sources` row
 * FOR UPDATE first, then the owned `unbooks` row. No transaction is ever held
 * across storage, parsing or embedding network work.
 */

export type IngestIdentity = {
  sourceId: string;
  userId: string;
  unbookId: string;
};

export type ExtractAndPersistResult = {
  active: boolean;
  totalChunks: number;
  alreadyIngested: boolean;
};

export type EmbedSourceBatchResult = {
  active: boolean;
  embeddedChunks: number;
  totalChunks: number;
};

export type FinishSourceIngestResult = {
  active: boolean;
  ingested: boolean;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QueryDatabase = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

/** `unbooks.cost_usd` is numeric(12,6). */
const COST_USD_DB_MAX = 999_999.999999;
/** Internal, reserved chapter marker for chapterless structural sections. */
const SECTION_TITLE_PREFIX = '__section:';
const ACTIVE_EXTRACT_STAGES = new Set(['reading', 'chunking', 'embedding']);
const ACTIVE_EMBED_STAGES = new Set(['chunking', 'embedding']);
const BLOCKED_STAGES = new Set(['cancelling', 'deleting']);
const INACTIVE_SOURCE_STATUSES = new Set(['failed']);
const EXTRACT_SOURCE_STATUSES = new Set(['uploaded', 'extracting']);

const identitySchema = z.strictObject({
  sourceId: z.uuid(),
  userId: z.uuid(),
  unbookId: z.uuid(),
});

const batchSchema = z.strictObject({
  startIdx: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(MAX_EMBEDDING_BATCH_SIZE),
});

type ChunkSummary = {
  id: string;
  idx: number;
  text: string;
  chapterTitle: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  tokenCount: number;
};

type EmbeddingChunk = { id: string; idx: number; text: string };

function parseIdentity(ids: IngestIdentity): IngestIdentity {
  const parsed = identitySchema.safeParse(ids);
  if (!parsed.success) throw new SourceError('invalidInput');
  return parsed.data;
}

function parseBatch(batch: { startIdx: number; limit: number }): {
  startIdx: number;
  limit: number;
} {
  const parsed = batchSchema.safeParse(batch);
  if (!parsed.success) throw new SourceError('invalidInput');
  return parsed.data;
}

/** Convert any thrown value to a fresh safe code; never copy a message/cause. */
function asSafeError(error: unknown): SourceError {
  if (error instanceof SourceError) return new SourceError(error.code);
  return new SourceError(toSourceErrorCode(error));
}

async function runSafely<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw asSafeError(error);
  }
}

function sourceIsUsable(source: Source): boolean {
  return source.rightsConfirmedAt !== null && source.fileDeletedAt === null;
}

function stageOf(unbook: Unbook): string | null {
  return unbook.currentStage ?? null;
}

function isBlocked(unbook: Unbook): boolean {
  const stage = stageOf(unbook);
  return stage !== null && BLOCKED_STAGES.has(stage);
}

async function lockOwnedPair(
  tx: Transaction,
  ids: IngestIdentity,
): Promise<{ source: Source; unbook: Unbook } | null> {
  const [source] = await tx
    .select()
    .from(sources)
    .where(and(eq(sources.id, ids.sourceId), eq(sources.userId, ids.userId)))
    .for('update');
  if (!source) return null;

  const [unbook] = await tx
    .select()
    .from(unbooks)
    .where(
      and(
        eq(unbooks.id, ids.unbookId),
        eq(unbooks.userId, ids.userId),
        eq(unbooks.sourceId, ids.sourceId),
      ),
    )
    .for('update');
  if (!unbook) return null;

  return { source, unbook };
}

function selectChunkSummaries(database: QueryDatabase, sourceId: string): Promise<ChunkSummary[]> {
  return database
    .select({
      id: sourceChunks.id,
      idx: sourceChunks.idx,
      text: sourceChunks.text,
      chapterTitle: sourceChunks.chapterTitle,
      pageFrom: sourceChunks.pageFrom,
      pageTo: sourceChunks.pageTo,
      tokenCount: sourceChunks.tokenCount,
    })
    .from(sourceChunks)
    .where(eq(sourceChunks.sourceId, sourceId)) as Promise<ChunkSummary[]>;
}

function contiguousFromZero(rows: ChunkSummary[]): boolean {
  if (rows.length === 0) return false;
  const sorted = [...rows].sort((a, b) => a.idx - b.idx);
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index]!.idx !== index) return false;
    if (sorted[index]!.text.trim().length === 0) return false;
  }
  return true;
}

function hasCompletePersistedChunks(source: Source, rows: ChunkSummary[]): boolean {
  if (source.pageCount === null || source.wordCount === null) return false;
  if (source.pageCount < 1 || source.wordCount < 1) return false;
  return contiguousFromZero(rows);
}

function validatePersistedMetadata(limits: PlanLimits, source: Source): void {
  if (source.pageCount === null) throw new SourceError('processingFailed');
  validateSourcePageCount(limits, source.pageCount);
  if (source.sizeBytes !== null) validateSourceFileSize(limits, source.sizeBytes);
}

function maxBytesFor(limits: PlanLimits): number {
  const bytes = Math.floor(limits.maxFileMb * 1024 * 1024);
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new SourceError('configurationMissing');
  return bytes;
}

function persistedChapterTitle(chunk: SourceChunkInput): string | null {
  if (chunk.chapterTitle !== null) return chunk.chapterTitle;
  if (chunk.sectionIndex === undefined) return null;
  return `${SECTION_TITLE_PREFIX}${chunk.sectionIndex}`;
}

async function replaceChunks(
  tx: Transaction,
  sourceId: string,
  chunks: SourceChunkInput[],
): Promise<void> {
  const existing = await selectChunkSummaries(tx, sourceId);
  const byIndex = new Map(existing.map((row) => [row.idx, row]));
  const inserts: (typeof sourceChunks.$inferInsert)[] = [];
  const staleIndexes: number[] = [];

  for (const chunk of chunks) {
    const chapterTitle = persistedChapterTitle(chunk);
    const current = byIndex.get(chunk.idx);
    if (!current) {
      inserts.push({
        sourceId,
        idx: chunk.idx,
        chapterTitle,
        pageFrom: chunk.pageFrom,
        pageTo: chunk.pageTo,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
      });
      continue;
    }

    byIndex.delete(chunk.idx);
    const unchanged =
      current.text === chunk.text &&
      current.chapterTitle === chapterTitle &&
      current.pageFrom === chunk.pageFrom &&
      current.pageTo === chunk.pageTo;
    if (!unchanged) {
      await tx
        .update(sourceChunks)
        .set({
          chapterTitle,
          pageFrom: chunk.pageFrom,
          pageTo: chunk.pageTo,
          text: chunk.text,
          tokenCount: chunk.tokenCount,
          embedding: null,
        })
        .where(and(eq(sourceChunks.id, current.id), eq(sourceChunks.sourceId, sourceId)));
    }
  }

  for (const leftover of byIndex.values()) staleIndexes.push(leftover.idx);
  if (staleIndexes.length > 0) {
    await tx
      .delete(sourceChunks)
      .where(and(eq(sourceChunks.sourceId, sourceId), inArray(sourceChunks.idx, staleIndexes)));
  }
  if (inserts.length > 0) await tx.insert(sourceChunks).values(inserts);
}

async function totalChunkCount(database: QueryDatabase, sourceId: string): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(sourceChunks)
    .where(eq(sourceChunks.sourceId, sourceId));
  return Number(row?.value ?? 0);
}

function urlTextKey(ids: IngestIdentity): string {
  return createSourceObjectKey(ids.userId, ids.sourceId, 'text');
}

function canonicalUrlText(pages: { text: string }[]): string {
  return pages
    .map((page) => page.text)
    .filter((text) => text.length > 0)
    .join('\n\n');
}

type ExtractPreparation =
  | { kind: 'inactive' }
  | { kind: 'already'; totalChunks: number }
  | { kind: 'reuse'; totalChunks: number }
  | { kind: 'work'; source: Source };

async function prepareExtraction(
  ids: IngestIdentity,
  limits: PlanLimits,
): Promise<ExtractPreparation> {
  return db.transaction(async (tx) => {
    const pair = await lockOwnedPair(tx, ids);
    if (!pair) return { kind: 'inactive' };
    const { source, unbook } = pair;
    if (!sourceIsUsable(source)) return { kind: 'inactive' };
    if (unbook.status !== 'queued') return { kind: 'inactive' };

    const stage = stageOf(unbook);
    if (stage === null || stage === 'uploading' || isBlocked(unbook)) return { kind: 'inactive' };

    if (stage === 'ingested' && source.status === 'ready') {
      const totalChunks = await totalChunkCount(tx, ids.sourceId);
      return { kind: 'already', totalChunks };
    }
    if (source.status === 'ready' || INACTIVE_SOURCE_STATUSES.has(source.status)) {
      return { kind: 'inactive' };
    }
    if (!EXTRACT_SOURCE_STATUSES.has(source.status) || !ACTIVE_EXTRACT_STAGES.has(stage)) {
      return { kind: 'inactive' };
    }

    const rows = await selectChunkSummaries(tx, ids.sourceId);
    if (hasCompletePersistedChunks(source, rows)) {
      validatePersistedMetadata(limits, source);
      if (stage === 'reading') {
        await tx
          .update(unbooks)
          .set({ currentStage: 'chunking' })
          .where(
            and(
              eq(unbooks.id, ids.unbookId),
              eq(unbooks.userId, ids.userId),
              eq(unbooks.sourceId, ids.sourceId),
              eq(unbooks.status, 'queued'),
            ),
          );
      }
      if (source.status !== 'extracting') {
        await tx
          .update(sources)
          .set({ status: 'extracting', errorCode: null })
          .where(and(eq(sources.id, ids.sourceId), eq(sources.userId, ids.userId)));
      }
      return { kind: 'reuse', totalChunks: rows.length };
    }

    await tx
      .update(sources)
      .set({ status: 'extracting', errorCode: null })
      .where(
        and(
          eq(sources.id, ids.sourceId),
          eq(sources.userId, ids.userId),
          inArray(sources.status, ['uploaded', 'extracting']),
        ),
      );
    await tx
      .update(unbooks)
      .set({ currentStage: 'chunking', progressPct: 15 })
      .where(
        and(
          eq(unbooks.id, ids.unbookId),
          eq(unbooks.userId, ids.userId),
          eq(unbooks.sourceId, ids.sourceId),
          eq(unbooks.status, 'queued'),
        ),
      );
    return { kind: 'work', source };
  });
}

async function extractBoundedSource(
  ids: IngestIdentity,
  source: Source,
  limits: PlanLimits,
): Promise<ExtractedSource> {
  const maxBytes = maxBytesFor(limits);
  const maxPages = limits.maxPagesPerSource;
  if (source.type === 'url') {
    if (!source.url) throw new SourceError('invalidUrl');
    return extractSource({ type: 'url', url: source.url, maxPages, maxBytes });
  }
  const fileKey = source.fileKey;
  if (!fileKey || !isOwnedSourceObjectKey(fileKey, ids.userId, ids.sourceId)) {
    throw new SourceError('notFound');
  }
  const bytes = await readSourceObject(fileKey, maxBytes);
  return extractSource({ type: source.type, bytes, maxPages, maxBytes });
}

async function shouldCompensateUrlText(ids: IngestIdentity): Promise<boolean> {
  try {
    const [source] = await db
      .select({ id: sources.id, fileDeletedAt: sources.fileDeletedAt })
      .from(sources)
      .where(and(eq(sources.id, ids.sourceId), eq(sources.userId, ids.userId)))
      .limit(1);
    if (!source || source.fileDeletedAt !== null) return true;
    const [unbook] = await db
      .select({ currentStage: unbooks.currentStage })
      .from(unbooks)
      .where(
        and(
          eq(unbooks.id, ids.unbookId),
          eq(unbooks.userId, ids.userId),
          eq(unbooks.sourceId, ids.sourceId),
        ),
      )
      .limit(1);
    if (!unbook) return true;
    return unbook.currentStage === 'deleting' || unbook.currentStage === 'cancelling';
  } catch {
    return false;
  }
}

async function persistExtraction(
  ids: IngestIdentity,
  source: Source,
  chunks: SourceChunkInput[],
  extractedAuthor: string | undefined,
  urlObject: { key: string; sizeBytes: number } | null,
): Promise<number> {
  return db.transaction(async (tx) => {
    const pair = await lockOwnedPair(tx, ids);
    if (!pair) return -1;
    const { source: lockedSource, unbook } = pair;
    if (!sourceIsUsable(lockedSource)) return -1;
    if (unbook.status !== 'queued' || isBlocked(unbook)) return -1;
    if (stageOf(unbook) !== 'chunking') return -1;
    if (!EXTRACT_SOURCE_STATUSES.has(lockedSource.status)) return -1;

    const metadata = {
      pageCount: source.pageCount,
      wordCount: source.wordCount,
      author: extractedAuthor ?? lockedSource.author,
    };
    if (urlObject) {
      await tx
        .update(sources)
        .set({
          ...metadata,
          fileKey: urlObject.key,
          mimeType: 'text/plain',
          sizeBytes: urlObject.sizeBytes,
        })
        .where(and(eq(sources.id, ids.sourceId), eq(sources.userId, ids.userId)));
    } else {
      await tx
        .update(sources)
        .set(metadata)
        .where(and(eq(sources.id, ids.sourceId), eq(sources.userId, ids.userId)));
    }

    await replaceChunks(tx, ids.sourceId, chunks);
    return chunks.length;
  });
}

/**
 * Read or reuse the bounded source, chunk it, and atomically persist page
 * metadata plus chunks. A partial retry keeps vectors for unchanged chunks;
 * deletion claims never receive writes and an in-flight URL text object is
 * compensated when the source is no longer claimable.
 */
export async function extractAndPersistSource(
  ids: IngestIdentity,
): Promise<ExtractAndPersistResult> {
  return runSafely(async () => {
    const parsed = parseIdentity(ids);
    const allowance = await getSourceAllowance(parsed.userId);
    const preparation = await prepareExtraction(parsed, allowance.limits);

    if (preparation.kind === 'inactive') {
      return { active: false, totalChunks: 0, alreadyIngested: false };
    }
    if (preparation.kind === 'already') {
      return {
        active: true,
        totalChunks: preparation.totalChunks,
        alreadyIngested: true,
      };
    }
    if (preparation.kind === 'reuse') {
      return {
        active: true,
        totalChunks: preparation.totalChunks,
        alreadyIngested: false,
      };
    }

    const extracted = await extractBoundedSource(parsed, preparation.source, allowance.limits);
    const chunks = chunkSource(extracted.pages);
    if (chunks.length === 0) throw new SourceError('noText');

    let urlObject: { key: string; sizeBytes: number } | null = null;
    if (preparation.source.type === 'url') {
      const canonical = canonicalUrlText(extracted.pages);
      if (canonical.trim().length === 0) throw new SourceError('noText');
      const sizeBytes = new TextEncoder().encode(canonical).byteLength;
      validateSourceFileSize(allowance.limits, sizeBytes);
      const key = urlTextKey(parsed);
      await putSourceText(key, canonical);
      urlObject = { key, sizeBytes };
    }

    let totalChunks: number;
    try {
      totalChunks = await persistExtraction(
        parsed,
        {
          ...preparation.source,
          pageCount: extracted.pageCount,
          wordCount: extracted.wordCount,
        } as Source,
        chunks,
        extracted.author,
        urlObject,
      );
    } catch (error) {
      if (urlObject && (await shouldCompensateUrlText(parsed))) {
        try {
          await deleteSourceObject(urlObject.key);
        } catch {
          // Best effort: the deterministic key is reused by a retry.
        }
      }
      throw error;
    }

    if (totalChunks < 0) {
      if (urlObject) {
        try {
          await deleteSourceObject(urlObject.key);
        } catch {
          // Best effort compensation only.
        }
      }
      return { active: false, totalChunks: 0, alreadyIngested: false };
    }

    return { active: true, totalChunks, alreadyIngested: false };
  });
}

type EmbedPreparation =
  | { kind: 'inactive' }
  | { kind: 'already'; totalChunks: number }
  | { kind: 'work'; totalChunks: number };

async function prepareEmbedding(ids: IngestIdentity): Promise<EmbedPreparation> {
  return db.transaction(async (tx) => {
    const pair = await lockOwnedPair(tx, ids);
    if (!pair) return { kind: 'inactive' };
    const { source, unbook } = pair;
    if (!sourceIsUsable(source)) return { kind: 'inactive' };
    if (unbook.status !== 'queued') return { kind: 'inactive' };
    const stage = stageOf(unbook);
    if (stage === null || stage === 'uploading' || isBlocked(unbook)) return { kind: 'inactive' };

    if (stage === 'ingested' && source.status === 'ready') {
      return { kind: 'already', totalChunks: await totalChunkCount(tx, ids.sourceId) };
    }
    if (source.status === 'ready' || INACTIVE_SOURCE_STATUSES.has(source.status)) {
      return { kind: 'inactive' };
    }
    if (!EXTRACT_SOURCE_STATUSES.has(source.status) || !ACTIVE_EMBED_STAGES.has(stage)) {
      return { kind: 'inactive' };
    }

    await tx
      .update(sources)
      .set({ status: 'extracting', errorCode: null })
      .where(
        and(
          eq(sources.id, ids.sourceId),
          eq(sources.userId, ids.userId),
          inArray(sources.status, ['uploaded', 'extracting']),
        ),
      );
    if (stage === 'chunking') {
      await tx
        .update(unbooks)
        .set({ currentStage: 'embedding' })
        .where(
          and(
            eq(unbooks.id, ids.unbookId),
            eq(unbooks.userId, ids.userId),
            eq(unbooks.sourceId, ids.sourceId),
            eq(unbooks.status, 'queued'),
          ),
        );
    }
    return { kind: 'work', totalChunks: await totalChunkCount(tx, ids.sourceId) };
  });
}

async function loadMissingChunks(
  sourceId: string,
  startIdx: number,
  limit: number,
): Promise<EmbeddingChunk[]> {
  return db
    .select({ id: sourceChunks.id, idx: sourceChunks.idx, text: sourceChunks.text })
    .from(sourceChunks)
    .where(
      and(
        eq(sourceChunks.sourceId, sourceId),
        gte(sourceChunks.idx, startIdx),
        lt(sourceChunks.idx, startIdx + limit),
        isNull(sourceChunks.embedding),
      ),
    ) as Promise<EmbeddingChunk[]>;
}

async function persistEmbeddings(
  ids: IngestIdentity,
  rows: EmbeddingChunk[],
  vectors: number[][],
  costUsd: number | null,
): Promise<{ active: boolean; embeddedChunks: number; totalChunks: number }> {
  return db.transaction(async (tx) => {
    const pair = await lockOwnedPair(tx, ids);
    if (!pair) return { active: false, embeddedChunks: 0, totalChunks: 0 };
    const { source, unbook } = pair;
    if (!sourceIsUsable(source) || unbook.status !== 'queued' || isBlocked(unbook)) {
      return { active: false, embeddedChunks: 0, totalChunks: 0 };
    }
    const stage = stageOf(unbook);
    if (stage === 'ingested' && source.status === 'ready') {
      return {
        active: true,
        embeddedChunks: 0,
        totalChunks: await totalChunkCount(tx, ids.sourceId),
      };
    }
    if (stage !== 'embedding' || !EXTRACT_SOURCE_STATUSES.has(source.status)) {
      return { active: false, embeddedChunks: 0, totalChunks: 0 };
    }

    let embeddedChunks = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      const vector = vectors[index];
      if (!vector) continue;
      const updated = await tx
        .update(sourceChunks)
        .set({ embedding: vector })
        .where(
          and(
            eq(sourceChunks.id, row.id),
            eq(sourceChunks.sourceId, ids.sourceId),
            eq(sourceChunks.text, row.text),
            isNull(sourceChunks.embedding),
          ),
        )
        .returning({ id: sourceChunks.id });
      if (updated.length > 0) embeddedChunks += 1;
    }

    if (embeddedChunks > 0 && costUsd !== null && Number.isFinite(costUsd) && costUsd >= 0) {
      const current = Number(unbook.costUsd);
      const base = Number.isFinite(current) && current >= 0 ? current : 0;
      const nextCost = Math.min(base + costUsd, COST_USD_DB_MAX);
      await tx
        .update(unbooks)
        .set({ costUsd: nextCost.toFixed(6) })
        .where(
          and(
            eq(unbooks.id, ids.unbookId),
            eq(unbooks.userId, ids.userId),
            eq(unbooks.sourceId, ids.sourceId),
          ),
        );
    }

    const totalChunks = await totalChunkCount(tx, ids.sourceId);
    const [missingRow] = await tx
      .select({ value: count() })
      .from(sourceChunks)
      .where(and(eq(sourceChunks.sourceId, ids.sourceId), isNull(sourceChunks.embedding)));
    const missing = Number(missingRow?.value ?? 0);

    if (totalChunks > 0 && missing === 0) {
      await tx
        .update(sources)
        .set({ status: 'ready', errorCode: null })
        .where(and(eq(sources.id, ids.sourceId), eq(sources.userId, ids.userId)));
      await tx
        .update(unbooks)
        .set({ currentStage: 'ingested', progressPct: 100 })
        .where(
          and(
            eq(unbooks.id, ids.unbookId),
            eq(unbooks.userId, ids.userId),
            eq(unbooks.sourceId, ids.sourceId),
            eq(unbooks.status, 'queued'),
          ),
        );
    } else if (embeddedChunks > 0 && totalChunks > 0) {
      const fraction = Math.min(1, Math.max(0, (totalChunks - missing) / totalChunks));
      const progressPct = Math.min(95, 15 + Math.floor(80 * fraction));
      await tx
        .update(unbooks)
        .set({ currentStage: 'embedding', progressPct })
        .where(
          and(
            eq(unbooks.id, ids.unbookId),
            eq(unbooks.userId, ids.userId),
            eq(unbooks.sourceId, ids.sourceId),
            eq(unbooks.status, 'queued'),
          ),
        );
    }

    return { active: true, embeddedChunks, totalChunks };
  });
}

/**
 * Embed one bounded batch of owned chunks that still lack vectors. The
 * provider call sits outside every transaction; vectors are written back only
 * for the exact chunk ids/text that are still null, and a known provider cost
 * is charged once per newly persisted batch.
 */
export async function embedSourceBatch(
  ids: IngestIdentity,
  batch: { startIdx: number; limit: number },
): Promise<EmbedSourceBatchResult> {
  return runSafely(async () => {
    const parsed = parseIdentity(ids);
    const range = parseBatch(batch);
    const preparation = await prepareEmbedding(parsed);
    if (preparation.kind === 'inactive') {
      return { active: false, embeddedChunks: 0, totalChunks: 0 };
    }
    if (preparation.kind === 'already') {
      return { active: true, embeddedChunks: 0, totalChunks: preparation.totalChunks };
    }

    const rows = await loadMissingChunks(parsed.sourceId, range.startIdx, range.limit);
    if (rows.length === 0) {
      return { active: true, embeddedChunks: 0, totalChunks: preparation.totalChunks };
    }

    const result = await runTask(
      'embedding',
      { texts: rows.map((row) => row.text) },
      { userId: parsed.userId },
    );
    return persistEmbeddings(parsed, rows, result.embeddings, result.costUsd);
  });
}

async function allChunksEmbedded(tx: Transaction, sourceId: string): Promise<boolean> {
  const [row] = await tx
    .select({
      total: count(),
      invalid: count(
        sql`case when ${sourceChunks.embedding} is null or btrim(${sourceChunks.text}) = '' then 1 end`,
      ),
    })
    .from(sourceChunks)
    .where(eq(sourceChunks.sourceId, sourceId));
  const total = Number(row?.total ?? 0);
  const invalid = Number(row?.invalid ?? 0);
  return total > 0 && invalid === 0;
}

/**
 * Verify the durable handoff state without writing modules or usage. Two
 * still-owned `queued` shapes are valid: the finished handoff (stage
 * `ingested`, ready error-free source) or a legitimate mid-ingest pair (stage
 * `chunking`/`embedding` with an `uploaded`/`extracting` source). In both
 * cases a complete nonempty embedded chunk set is required; for the mid-ingest
 * shape the finished state (`ready` + `ingested` + progress 100) is healed
 * atomically in the same locked transaction. Failed, blocked, terminal or
 * non-owned pairs are never finished.
 */
export async function finishSourceIngest(ids: IngestIdentity): Promise<FinishSourceIngestResult> {
  return runSafely(async () => {
    const parsed = parseIdentity(ids);
    return db.transaction(async (tx) => {
      const pair = await lockOwnedPair(tx, parsed);
      if (!pair) return { active: false, ingested: false };
      const { source, unbook } = pair;
      if (!sourceIsUsable(source) || isBlocked(unbook)) {
        return { active: false, ingested: false };
      }
      if (unbook.status !== 'queued' || unbook.completedAt !== null) {
        return { active: false, ingested: false };
      }
      const stage = stageOf(unbook);
      const alreadyIngested =
        stage === 'ingested' && source.status === 'ready' && source.errorCode === null;
      const midIngest =
        (stage === 'chunking' || stage === 'embedding') &&
        EXTRACT_SOURCE_STATUSES.has(source.status);
      if (!alreadyIngested && !midIngest) {
        return { active: false, ingested: false };
      }
      if (!(await allChunksEmbedded(tx, parsed.sourceId))) {
        return { active: false, ingested: false };
      }
      if (!alreadyIngested) {
        await tx
          .update(sources)
          .set({ status: 'ready', errorCode: null })
          .where(
            and(
              eq(sources.id, parsed.sourceId),
              eq(sources.userId, parsed.userId),
              inArray(sources.status, ['uploaded', 'extracting']),
            ),
          );
        await tx
          .update(unbooks)
          .set({ currentStage: 'ingested', progressPct: 100 })
          .where(
            and(
              eq(unbooks.id, parsed.unbookId),
              eq(unbooks.userId, parsed.userId),
              eq(unbooks.sourceId, parsed.sourceId),
              eq(unbooks.status, 'queued'),
            ),
          );
      }
      return { active: true, ingested: true };
    });
  });
}

/**
 * Mark an active unfinished ingest failed with a safe code. Chunks and vectors
 * are always preserved so an explicit retry can reuse committed work.
 */
export async function failSourceIngest(ids: IngestIdentity, code: SourceErrorCode): Promise<void> {
  return runSafely(async () => {
    const parsed = parseIdentity(ids);
    if (!isSourceErrorCode(code)) throw new SourceError('invalidInput');
    await db.transaction(async (tx) => {
      const pair = await lockOwnedPair(tx, parsed);
      if (!pair) return;
      const { source, unbook } = pair;
      if (!sourceIsUsable(source)) return;
      if (source.status === 'ready' || source.status === 'failed') return;
      if (unbook.status !== 'queued') return;
      const stage = stageOf(unbook);
      if (
        stage === null ||
        stage === 'uploading' ||
        stage === 'ingested' ||
        stage === 'ready' ||
        stage === 'failed' ||
        BLOCKED_STAGES.has(stage)
      ) {
        return;
      }

      await tx
        .update(sources)
        .set({ status: 'failed', errorCode: code })
        .where(and(eq(sources.id, parsed.sourceId), eq(sources.userId, parsed.userId)));
      await tx
        .update(unbooks)
        .set({ status: 'failed', currentStage: 'failed' })
        .where(
          and(
            eq(unbooks.id, parsed.unbookId),
            eq(unbooks.userId, parsed.userId),
            eq(unbooks.sourceId, parsed.sourceId),
            eq(unbooks.status, 'queued'),
          ),
        );
    });
  });
}

/** True only while the owned source-ready/ingested handoff pair still exists. */
export async function canSendIngestHandoff(ids: IngestIdentity): Promise<boolean> {
  return runSafely(async () => {
    const parsed = parseIdentity(ids);
    const [source] = await db
      .select()
      .from(sources)
      .where(and(eq(sources.id, parsed.sourceId), eq(sources.userId, parsed.userId)))
      .limit(1);
    if (!source || !sourceIsUsable(source)) return false;
    const [unbook] = await db
      .select()
      .from(unbooks)
      .where(
        and(
          eq(unbooks.id, parsed.unbookId),
          eq(unbooks.userId, parsed.userId),
          eq(unbooks.sourceId, parsed.sourceId),
        ),
      )
      .limit(1);
    if (!unbook) return false;
    return (
      source.status === 'ready' &&
      source.errorCode === null &&
      unbook.status === 'queued' &&
      unbook.currentStage === 'ingested' &&
      unbook.completedAt === null &&
      !isBlocked(unbook)
    );
  });
}
