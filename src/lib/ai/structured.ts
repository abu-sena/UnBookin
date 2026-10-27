import 'server-only';
import { z, type ZodType } from 'zod';
import { db } from '@/db';
import { aiCalls } from '@/db/schema';
import { getTaskConfig } from '@/lib/ai/task-config';
import { SourceError, type SourceErrorCode } from '@/lib/sources/errors';

type Message = { role: 'system' | 'user' | 'assistant'; content: string };
type Usage = { inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
export type StructuredTaskInput<T> = {
  task: string;
  schema: ZodType<T>;
  prompt: { system: string; user: string; version: string };
  userId: string;
  validate?: (data: T) => string[];
  /** Per-call timeout (default 90 s). */
  timeoutMs?: number;
  /**
   * Total budget for ALL calls of this task (primary, repair, fallback). One Inngest step runs inside one
   * Vercel invocation (max 300 s on Hobby), so the default leaves headroom for persistence.
   */
  deadlineMs?: number;
};
export type StructuredTaskResult<T> = {
  data: T;
  model: string;
  usedFallback: boolean;
  costUsd: number;
  costComplete: boolean;
  calls: number;
};

/**
 * M8 adds BYOK selection (PRD §7.2 step 2, AC6), with no silent fallback to
 * the platform key when a user's BYOK key fails. Embedding stays platform-only.
 */
export function resolveTaskKey(userId: string): string {
  void userId;
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new SourceError('configurationMissing');
  return key;
}

const MAX_RESPONSE_BYTES = 1_048_576;
const DEFAULT_CALL_TIMEOUT_MS = 90_000;
const DEFAULT_DEADLINE_MS = 240_000;
/** Do not start a call that cannot finish meaningfully before the deadline. */
const MIN_CALL_BUDGET_MS = 15_000;
const MAX_DB_INTEGER = 2_147_483_647;
const envelopeSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

function tokenCount(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_DB_INTEGER
    ? value
    : null;
}

function usageMetadata(body: unknown): Usage {
  const parsed = z
    .object({
      usage: z.object({
        prompt_tokens: z.unknown().optional(),
        completion_tokens: z.unknown().optional(),
        cost: z.unknown().optional(),
      }),
    })
    .safeParse(body);
  const usage = parsed.success ? parsed.data.usage : undefined;
  const cost = usage?.cost;
  return {
    inputTokens: tokenCount(usage?.prompt_tokens),
    outputTokens: tokenCount(usage?.completion_tokens),
    costUsd:
      typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 && cost <= 999_999.999999
        ? cost
        : null,
  };
}

/** Bound decoded response bytes while streaming; never retain an unbounded body. */
async function readBody(response: Response): Promise<unknown> {
  if (!response.body) throw new SourceError('generationUnavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new SourceError('generationUnavailable');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    reader.releaseLock();
  }
}

function repairMessage(issues: string[], source: string): string {
  // Validator messages are diagnostic strings, never a place for source excerpts.
  const sourceParts = [source, ...source.split(/\s+/).filter((part) => part.length >= 12)];
  let summary = issues.slice(0, 20).join('\n').slice(0, 2000);
  for (const part of sourceParts) {
    if (part) summary = summary.replaceAll(part, '[redacted]');
  }
  return `Return corrected JSON only. Fix these validation issues:\n${summary}`.slice(0, 2000);
}

export async function runStructuredTask<T>(
  input: StructuredTaskInput<T>,
): Promise<StructuredTaskResult<T>> {
  const config = await getTaskConfig(input.task);
  const key = resolveTaskKey(input.userId);
  const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
  const jsonSchema = z.toJSONSchema(input.schema);
  const totals = { costUsd: 0, costComplete: true, calls: 0 };
  const deadline = Date.now() + (input.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const models = [config.model, ...(config.fallbackModel ? [config.fallbackModel] : [])];

  for (const [modelIndex, model] of models.entries()) {
    const messages: Message[] = [
      { role: 'system', content: input.prompt.system },
      { role: 'user', content: input.prompt.user },
    ];
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      // Out of budget: a retriable failure, so Inngest re-runs the step with a fresh budget.
      if (remaining < MIN_CALL_BUDGET_MS) throw new SourceError('generationUnavailable');
      const callTimeoutMs = Math.min(input.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS, remaining);
      const startedAt = Date.now();
      let usage = usageMetadata(undefined);
      let status: 'succeeded' | 'failed' | 'invalid' = 'failed';
      let errorCode: SourceErrorCode | null = 'generationUnavailable';
      let content = '';
      let issues: string[] = [];
      let result: { data: T } | undefined;
      let canFallback = true;
      totals.calls++;
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://unbookin.com',
            'X-Title': 'Unbookin',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: config.temperature,
            max_tokens: config.maxOutputTokens,
            response_format: {
              type: 'json_schema',
              // strict:false — OpenAI strict mode rejects schemas with optional fields (e.g. keyQuote);
              // the Zod parse + one repair below enforce the contract instead.
              json_schema: { name: input.task, strict: false, schema: jsonSchema },
            },
            usage: { include: true },
          }),
          signal: AbortSignal.timeout(callTimeoutMs),
          cache: 'no-store',
        });
        if (!response.ok) {
          canFallback =
            response.status === 408 || response.status === 429 || response.status >= 500;
          if (response.status === 401 || response.status === 403) {
            errorCode = 'configurationMissing';
          }
          // Error bodies can contain vendor/user content; never read or log them.
          await response.body?.cancel();
          throw new SourceError(errorCode);
        }
        const body = await readBody(response);
        usage = usageMetadata(body);
        const envelope = envelopeSchema.safeParse(body);
        status = 'invalid';
        errorCode = 'generationInvalid';
        if (!envelope.success) {
          issues = ['choices.0.message.content: missing JSON reply'];
        } else {
          content = envelope.data.choices[0]?.message.content ?? '';
          let decoded: unknown;
          try {
            decoded = JSON.parse(content) as unknown;
          } catch {
            issues = ['$: invalid JSON'];
          }
          if (issues.length === 0) {
            const parsed = input.schema.safeParse(decoded);
            if (!parsed.success) {
              // Zod messages may contain raw values; paths and codes suffice for repair.
              issues = parsed.error.issues
                .slice(0, 20)
                .map((issue) => `${issue.path.map(String).join('.') || '$'}: ${issue.code}`);
            } else {
              issues = input.validate?.(parsed.data) ?? [];
              if (issues.length === 0) {
                result = { data: parsed.data };
                status = 'succeeded';
                errorCode = null;
              }
            }
          }
        }
      } catch {
        status = 'failed';
        if (errorCode !== 'configurationMissing') errorCode = 'generationUnavailable';
      } finally {
        totals.costUsd += usage.costUsd ?? 0;
        if (usage.costUsd === null) totals.costComplete = false;
        await logCall(input, model, usage, status, errorCode, Date.now() - startedAt);
      }
      if (result) return { data: result.data, model, usedFallback: modelIndex > 0, ...totals };
      if (status === 'failed') {
        if (!canFallback || modelIndex === models.length - 1) {
          throw new SourceError(errorCode ?? 'generationUnavailable');
        }
        break;
      }
      if (attempt === 0) {
        messages.push(
          { role: 'assistant', content },
          {
            role: 'user',
            content: repairMessage(issues, input.prompt.user),
          },
        );
      }
    }
  }
  throw new SourceError('generationInvalid');
}

/** Metadata only; a failed log write must never change the task outcome. */
async function logCall<T>(
  input: StructuredTaskInput<T>,
  model: string,
  usage: Usage,
  status: 'succeeded' | 'failed' | 'invalid',
  error: SourceErrorCode | null,
  latencyMs: number,
): Promise<void> {
  try {
    await db.insert(aiCalls).values({
      userId: input.userId,
      task: input.task,
      model,
      byok: false,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd === null ? null : usage.costUsd.toFixed(6),
      latencyMs: Math.min(Math.max(Math.round(latencyMs), 0), MAX_DB_INTEGER),
      status,
      error,
      promptVersion: input.prompt.version,
    });
  } catch {
    // Best effort: no prompts, outputs, keys or vendor messages reach logs.
  }
}
