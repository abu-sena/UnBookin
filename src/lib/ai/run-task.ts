import 'server-only';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { aiCalls, aiTaskConfigs } from '@/db/schema';
import { SourceError } from '@/lib/sources/errors';

/**
 * Platform embedding gateway (E2-01 pipeline prerequisite). The model comes
 * ONLY from the active `ai_task_configs` row for the task; no model id literal
 * and no environment shortcut exists. The platform OpenRouter key is always
 * used here (BYOK is out of scope for this milestone).
 */

export const EMBEDDING_TASK = 'embedding' as const;
export const EMBEDDING_DIMENSIONS = 1536;
/** Bounded request size: at most 16 texts per embedding request. */
export const MAX_EMBEDDING_BATCH_SIZE = 16;
export const EMBEDDING_TIMEOUT_MS = 30_000;
/** Successful config lookups are cached for at most 5 minutes. */
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const APP_HTTP_REFERER = 'https://unbookin.com';
const APP_TITLE = 'Unbookin';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
/** Sanity bound for one request body; chunk text never reaches logs. */
const MAX_TOTAL_INPUT_BYTES = 600_000;

export type EmbeddingRunResult = {
  embeddings: number[][];
  costUsd: number | null;
};

const runTaskInputSchema = z.strictObject({
  texts: z.array(z.string().min(1)).min(1).max(MAX_EMBEDDING_BATCH_SIZE),
});

const embeddingsResponseSchema = z.object({
  data: z.array(
    z.object({
      index: z.number().int(),
      embedding: z.array(z.number()),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
      cost: z.number().optional(),
    })
    .optional(),
});

type ConfigCache = { model: string; expiresAt: number };
let configCache: ConfigCache | null = null;

/** Test helper: clear the memoized successful config lookup. */
export function resetEmbeddingConfigCache(): void {
  configCache = null;
}

async function resolveEmbeddingModel(): Promise<string> {
  const now = Date.now();
  if (configCache && configCache.expiresAt > now) return configCache.model;

  const [row] = await db
    .select({ model: aiTaskConfigs.model })
    .from(aiTaskConfigs)
    .where(and(eq(aiTaskConfigs.task, EMBEDDING_TASK), eq(aiTaskConfigs.isActive, true)))
    .limit(1);

  const model = row?.model?.trim();
  if (!model) throw new SourceError('configurationMissing');

  configCache = { model, expiresAt: now + CONFIG_CACHE_TTL_MS };
  return model;
}

/** Best-effort metadata log; never masks the run result, never logs content. */
async function logAiCall(values: {
  userId: string;
  model: string;
  status: 'succeeded' | 'failed';
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  latencyMs: number;
  errorCode: string | null;
}): Promise<void> {
  try {
    await db.insert(aiCalls).values({
      userId: values.userId,
      task: EMBEDDING_TASK,
      model: values.model,
      byok: false,
      inputTokens: values.inputTokens,
      outputTokens: values.outputTokens,
      costUsd: values.costUsd === null ? null : values.costUsd.toFixed(6),
      latencyMs: Math.min(Math.max(Math.round(values.latencyMs), 0), Number.MAX_SAFE_INTEGER),
      status: values.status,
      error: values.errorCode,
    });
  } catch {
    // Intentionally ignored: logging must never break the embedding run.
  }
}

/**
 * Run the configured embedding task for a bounded batch of texts.
 *
 * Returns one 1536-dimension finite-number vector per input text, reordered to
 * match the input order regardless of the indexes the provider returned.
 * Every failure is a safe `SourceError` (`invalidInput`,
 * `configurationMissing` or `embeddingUnavailable`); driver detail, raw
 * bodies, keys and input text are never part of an error.
 */
export async function runTask(
  task: typeof EMBEDDING_TASK,
  input: { texts: string[] },
  options: { userId: string },
): Promise<EmbeddingRunResult> {
  if (task !== EMBEDDING_TASK) throw new SourceError('invalidInput');
  if (!z.uuid().safeParse(options.userId).success) throw new SourceError('invalidInput');

  const parsed = runTaskInputSchema.safeParse(input);
  if (!parsed.success) throw new SourceError('invalidInput');
  const texts = parsed.data.texts;
  if (new TextEncoder().encode(JSON.stringify(texts)).byteLength > MAX_TOTAL_INPUT_BYTES) {
    throw new SourceError('invalidInput');
  }

  const model = await resolveEmbeddingModel();

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new SourceError('configurationMissing');
  const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL;

  const startedAt = Date.now();
  let usage: z.infer<typeof embeddingsResponseSchema>['usage'];
  let embeddings: number[][];

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APP_HTTP_REFERER,
        'X-Title': APP_TITLE,
      },
      body: JSON.stringify({ model, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!response.ok) throw new SourceError('embeddingUnavailable');

    const parsedResponse = embeddingsResponseSchema.safeParse(await response.json());
    if (!parsedResponse.success) throw new SourceError('embeddingUnavailable');
    usage = parsedResponse.data.usage;
    embeddings = reorderEmbeddings(parsedResponse.data.data, texts.length);
  } catch (error) {
    const code = error instanceof SourceError ? error.code : 'embeddingUnavailable';
    await logAiCall({
      userId: options.userId,
      model,
      status: 'failed',
      inputTokens: usage?.prompt_tokens ?? null,
      outputTokens: usage?.total_tokens ?? null,
      costUsd: usage?.cost ?? null,
      latencyMs: Date.now() - startedAt,
      errorCode: code,
    });
    throw new SourceError(code);
  }

  await logAiCall({
    userId: options.userId,
    model,
    status: 'succeeded',
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.total_tokens ?? null,
    costUsd: usage?.cost ?? null,
    latencyMs: Date.now() - startedAt,
    errorCode: null,
  });

  return { embeddings, costUsd: usage?.cost ?? null };
}

/**
 * Enforce the response contract: exactly one entry per input, unique valid
 * indexes, and one finite 1536-number vector each. Returns vectors in input
 * order; any violation is a safe provider failure.
 */
function reorderEmbeddings(
  data: { index: number; embedding: number[] }[],
  expectedCount: number,
): number[][] {
  if (data.length !== expectedCount) throw new SourceError('embeddingUnavailable');

  const seen = new Set<number>();
  const ordered: (number[] | null)[] = Array.from({ length: expectedCount }, () => null);

  for (const entry of data) {
    const index = entry.index;
    if (!Number.isInteger(index) || index < 0 || index >= expectedCount) {
      throw new SourceError('embeddingUnavailable');
    }
    if (seen.has(index)) throw new SourceError('embeddingUnavailable');
    seen.add(index);

    const vector = entry.embedding;
    if (vector.length !== EMBEDDING_DIMENSIONS) throw new SourceError('embeddingUnavailable');
    for (const value of vector) {
      if (!Number.isFinite(value)) throw new SourceError('embeddingUnavailable');
    }
    ordered[index] = vector;
  }

  if (seen.size !== expectedCount) throw new SourceError('embeddingUnavailable');
  return ordered.map((vector) => {
    if (!vector) throw new SourceError('embeddingUnavailable');
    return vector;
  });
}
