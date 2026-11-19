import 'server-only';
import { z } from 'zod';
import { db } from '@/db';
import { aiCalls } from '@/db/schema';
import { getTaskConfig } from '@/lib/ai/task-config';
import { resolveTaskKey } from '@/lib/ai/structured';
import { SourceError, type SourceErrorCode } from '@/lib/sources/errors';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
};

export type StreamChatEvent =
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      model: string;
      usedFallback: boolean;
      usage: ChatUsage;
      finish: 'stop' | 'length' | 'aborted';
    };

export type StreamChatInput = {
  task: string;
  messages: ChatMessage[];
  userId: string;
  promptVersion: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  firstTokenTimeoutMs?: number;
};

/** Bound decoded stream bytes; a runaway provider response must not grow forever. */
export const MAX_STREAM_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 20_000;
const MAX_DB_INTEGER = 2_147_483_647;
const COST_USD_DB_MAX = 999_999.999999;
const APP_HTTP_REFERER = 'https://unbookin.com';
const APP_TITLE = 'Unbookin';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const streamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.unknown().optional() }).optional(),
        finish_reason: z.unknown().optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.unknown().optional(),
      completion_tokens: z.unknown().optional(),
      cost: z.unknown().optional(),
    })
    .optional(),
  error: z.unknown().optional(),
});

type StreamChunk = {
  text: string | null;
  finish: 'stop' | 'length' | null;
  usage: ChatUsage | null;
  error: boolean;
};

function tokenCount(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_DB_INTEGER
    ? value
    : null;
}

function sanitizeUsage(usage: z.infer<typeof streamChunkSchema>['usage']): ChatUsage | null {
  if (!usage) return null;
  const cost = usage.cost;
  return {
    inputTokens: tokenCount(usage.prompt_tokens),
    outputTokens: tokenCount(usage.completion_tokens),
    costUsd:
      typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 && cost <= COST_USD_DB_MAX
        ? cost
        : null,
  };
}

const emptyUsage = (): ChatUsage => ({ inputTokens: null, outputTokens: null, costUsd: null });

/** SSE `data:` payload, or undefined for comments, blank lines and other fields. */
function readSseData(line: string): string | undefined {
  if (!line || line.startsWith(':')) return undefined;
  if (!line.startsWith('data:')) return undefined;
  return line.slice('data:'.length).trim();
}

/** A malformed JSON payload is ignored; it never reaches the caller. */
function parseStreamChunk(payload: string): StreamChunk | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
  const parsed = streamChunkSchema.safeParse(decoded);
  if (!parsed.success) return null;
  const choice = parsed.data.choices?.[0];
  const rawContent = choice?.delta?.content;
  return {
    text: typeof rawContent === 'string' && rawContent.length > 0 ? rawContent : null,
    finish:
      choice?.finish_reason === 'length'
        ? 'length'
        : choice?.finish_reason === 'stop'
          ? 'stop'
          : null,
    usage: sanitizeUsage(parsed.data.usage),
    error: parsed.data.error !== undefined && parsed.data.error !== null,
  };
}

/** Metadata only; a failed log write must never change the stream outcome. */
async function logCall(values: {
  userId: string;
  task: string;
  model: string;
  usage: ChatUsage;
  latencyMs: number;
  status: 'succeeded' | 'failed' | 'aborted';
  error: SourceErrorCode | null;
  promptVersion: string;
  byok: boolean;
}): Promise<void> {
  try {
    await db.insert(aiCalls).values({
      userId: values.userId,
      task: values.task,
      model: values.model,
      byok: values.byok,
      inputTokens: values.usage.inputTokens,
      outputTokens: values.usage.outputTokens,
      costUsd: values.usage.costUsd === null ? null : values.usage.costUsd.toFixed(6),
      latencyMs: Math.min(Math.max(Math.round(values.latencyMs), 0), MAX_DB_INTEGER),
      status: values.status,
      error: values.error,
      promptVersion: values.promptVersion,
    });
  } catch {
    // Best effort: no prompts, outputs, keys or vendor messages reach logs.
  }
}

function errorCodeForStatus(status: number, byok: boolean): SourceErrorCode {
  if (byok && (status === 401 || status === 402 || status === 403)) return 'byokKeyRejected';
  return status === 401 || status === 403 ? 'configurationMissing' : 'generationUnavailable';
}

/**
 * Stream one chat task through OpenRouter. Fallback is used only when the
 * primary model fails before the first token. A caller abort yields a final
 * `done` with `finish: 'aborted'`; other failures throw a safe `SourceError`.
 */
export async function* streamChatTask(input: StreamChatInput): AsyncGenerator<StreamChatEvent> {
  const config = await getTaskConfig(input.task);
  const taskKey = await resolveTaskKey(input.userId);
  const key = taskKey.key;
  const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const firstTokenTimeoutMs = input.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS;
  const models = [config.model, ...(config.fallbackModel ? [config.fallbackModel] : [])];

  for (const [modelIndex, model] of models.entries()) {
    const startedAt = Date.now();
    let usage = emptyUsage();
    let finish: 'stop' | 'length' | 'aborted' = 'stop';
    let firstToken = false;
    let outcome: 'done' | 'aborted' | 'fatal' = 'fatal';
    let fatalCode: SourceErrorCode = 'generationUnavailable';
    let canFallback = true;

    const controller = new AbortController();
    let callerAborted = input.signal?.aborted ?? false;
    let firstTimedOut = false;
    const onAbort = () => {
      callerAborted = true;
      controller.abort();
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });
    const totalTimer = setTimeout(() => controller.abort(), timeoutMs);
    let firstTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      firstTimedOut = true;
      controller.abort();
    }, firstTokenTimeoutMs);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': APP_HTTP_REFERER,
          'X-Title': APP_TITLE,
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          temperature: config.temperature,
          max_tokens: config.maxOutputTokens,
          stream: true,
          usage: { include: true },
        }),
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        canFallback = response.status === 408 || response.status === 429 || response.status >= 500;
        fatalCode = errorCodeForStatus(response.status, taskKey.byok);
        // Error bodies can contain vendor/user content; never read or log them.
        await response.body?.cancel();
        outcome = 'fatal';
      } else if (!response.body) {
        outcome = 'fatal';
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = '';
        let bytes = 0;
        let streamError: SourceErrorCode | null = null;
        let sawDone = false;
        try {
          read: for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_STREAM_BYTES) {
              await reader.cancel();
              streamError = 'generationUnavailable';
              break;
            }
            lineBuffer += decoder.decode(value, { stream: true });
            let newline = lineBuffer.indexOf('\n');
            while (newline !== -1) {
              let line = lineBuffer.slice(0, newline);
              lineBuffer = lineBuffer.slice(newline + 1);
              if (line.endsWith('\r')) line = line.slice(0, -1);
              const payload = readSseData(line);
              if (payload !== undefined) {
                if (payload === '[DONE]') {
                  sawDone = true;
                  break read;
                }
                const chunk = parseStreamChunk(payload);
                if (chunk?.error) {
                  streamError = 'generationUnavailable';
                  break read;
                }
                if (chunk?.usage) usage = chunk.usage;
                if (chunk?.finish === 'length') finish = 'length';
                if (chunk?.text) {
                  if (!firstToken) {
                    firstToken = true;
                    if (firstTimer) clearTimeout(firstTimer);
                    firstTimer = undefined;
                  }
                  yield { type: 'delta', text: chunk.text };
                }
              }
              newline = lineBuffer.indexOf('\n');
            }
          }
        } finally {
          reader.releaseLock();
        }
        if (streamError) {
          fatalCode = streamError;
          outcome = 'fatal';
        } else if (sawDone || firstToken) {
          // A provider that closes after content without [DONE] still succeeded.
          outcome = 'done';
        } else {
          outcome = 'fatal';
        }
      }
    } catch {
      if (callerAborted) {
        outcome = 'aborted';
      } else if (firstTimedOut && !firstToken) {
        fatalCode = 'generationUnavailable';
        outcome = 'fatal';
      } else {
        fatalCode = 'generationUnavailable';
        outcome = 'fatal';
      }
    } finally {
      clearTimeout(totalTimer);
      if (firstTimer) clearTimeout(firstTimer);
      input.signal?.removeEventListener('abort', onAbort);
      // Also ends the upstream request when the consumer stops iterating early.
      controller.abort();
      const status =
        outcome === 'done' ? 'succeeded' : outcome === 'aborted' ? 'aborted' : 'failed';
      await logCall({
        userId: input.userId,
        task: input.task,
        model,
        usage,
        latencyMs: Date.now() - startedAt,
        status,
        error: outcome === 'fatal' ? fatalCode : null,
        promptVersion: input.promptVersion,
        byok: taskKey.byok,
      });
    }

    if (outcome === 'done') {
      yield { type: 'done', model, usedFallback: modelIndex > 0, usage, finish };
      return;
    }
    if (outcome === 'aborted') {
      yield { type: 'done', model, usedFallback: modelIndex > 0, usage, finish: 'aborted' };
      return;
    }
    if (firstToken || !canFallback || modelIndex === models.length - 1) {
      throw new SourceError(fatalCode);
    }
  }

  throw new SourceError('generationUnavailable');
}
