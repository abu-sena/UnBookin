import 'server-only';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { runTask } from '@/lib/ai/run-task';

/**
 * Hybrid chunk retrieval for the mentor RAG flow: pgvector cosine plus the same
 * full-text expression as the GIN index, merged with Reciprocal Rank Fusion.
 * Every query filters by `source_id`. Fewer or zero rows is a valid result.
 */

const RRF_K = 60;
const PER_LIST_LIMIT = 20;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 8;

export type RetrievedChunk = {
  id: string;
  idx: number;
  text: string;
  pageFrom: number | null;
  pageTo: number | null;
  chapterTitle: string | null;
};

export type RetrievalMode = 'hybrid' | 'text';

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  mode: RetrievalMode;
};

const inputSchema = z.object({
  sourceId: z.string().min(1),
  question: z.string().trim().min(1).max(2000),
  userId: z.string().min(1),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
});

/**
 * Reciprocal Rank Fusion. Ranks are 1-based per list; ties break by first
 * appearance so the output is deterministic.
 */
export function mergeRanks(rankings: readonly (readonly string[])[], k = RRF_K): string[] {
  const scores = new Map<string, { score: number; first: number }>();
  let order = 0;
  for (const ranking of rankings) {
    for (const [index, id] of ranking.entries()) {
      const current = scores.get(id);
      const score = 1 / (k + index + 1);
      if (current) current.score += score;
      else scores.set(id, { score, first: order++ });
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].first - b[1].first)
    .map(([id]) => id);
}

type RawRow = Record<string, unknown>;

function rowToChunk(row: RawRow): RetrievedChunk | null {
  if (typeof row.id !== 'string' || typeof row.text !== 'string' || typeof row.idx !== 'number') {
    return null;
  }
  return {
    id: row.id,
    idx: row.idx,
    text: row.text,
    pageFrom: typeof row.page_from === 'number' ? row.page_from : null,
    pageTo: typeof row.page_to === 'number' ? row.page_to : null,
    chapterTitle: typeof row.chapter_title === 'string' ? row.chapter_title : null,
  };
}

function rowsOf(result: unknown): RawRow[] {
  if (result === null || typeof result !== 'object') return [];
  return Array.from(result as Iterable<RawRow>);
}

function vectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(',')}]`;
}

async function embedQuestion(question: string, userId: string): Promise<number[] | null> {
  try {
    const { embeddings } = await runTask('embedding', { texts: [question] }, { userId });
    return embeddings[0] ?? null;
  } catch {
    // Embedding failure or missing configuration degrades to full-text search.
    return null;
  }
}

async function cosineRows(sourceId: string, vector: number[]): Promise<RawRow[]> {
  const literal = vectorLiteral(vector);
  const result = await db.execute(sql`
    select id, idx, text, page_from, page_to, chapter_title
    from source_chunks
    where source_id = ${sourceId} and embedding is not null
    order by embedding <=> ${literal}::vector
    limit ${PER_LIST_LIMIT}
  `);
  return rowsOf(result);
}

async function textRows(sourceId: string, question: string): Promise<RawRow[]> {
  const result = await db.execute(sql`
    select id, idx, text, page_from, page_to, chapter_title
    from source_chunks
    where source_id = ${sourceId}
      and to_tsvector('simple', text) @@ websearch_to_tsquery('simple', ${question})
    order by ts_rank(
      to_tsvector('simple', text),
      websearch_to_tsquery('simple', ${question})
    ) desc
    limit ${PER_LIST_LIMIT}
  `);
  return rowsOf(result);
}

export async function retrieveChunks(input: {
  sourceId: string;
  question: string;
  userId: string;
  limit?: number;
}): Promise<RetrievalResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { chunks: [], mode: 'text' };
  const { sourceId, question, userId } = parsed.data;
  const limit = parsed.data.limit ?? DEFAULT_LIMIT;

  const vector = await embedQuestion(question, userId);
  const byId = new Map<string, RetrievedChunk>();
  const rankings: string[][] = [];

  if (vector) {
    const rows = await cosineRows(sourceId, vector);
    const ids: string[] = [];
    for (const row of rows) {
      const chunk = rowToChunk(row);
      if (!chunk) continue;
      byId.set(chunk.id, chunk);
      ids.push(chunk.id);
    }
    rankings.push(ids);
  }

  const text = await textRows(sourceId, question);
  const textIds: string[] = [];
  for (const row of text) {
    const chunk = rowToChunk(row);
    if (!chunk) continue;
    if (!byId.has(chunk.id)) byId.set(chunk.id, chunk);
    textIds.push(chunk.id);
  }
  rankings.push(textIds);

  const chunks = mergeRanks(rankings)
    .map((id) => byId.get(id))
    .filter((chunk): chunk is RetrievedChunk => chunk !== undefined)
    .slice(0, limit);

  return { chunks, mode: vector ? 'hybrid' : 'text' };
}
