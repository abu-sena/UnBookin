/**
 * Pure helper for the OPTIONAL embedding model configuration (E2-01).
 *
 * The founder fills `EMBEDDING_MODEL` in `.env.local` / deployment settings;
 * the seed turns that value into the `ai_task_configs` row that
 * `src/lib/ai/run-task.ts` reads at runtime. A blank or commented value means
 * "not configured": the seed skips the row and `runTask` fails with the safe
 * `configurationMissing` code, which is the documented contract.
 */
export function resolveEmbeddingModelFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.EMBEDDING_MODEL;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  return trimmed;
}

/** Fixed placeholder row shape for the seed; embeddings ignore token limits. */
export function buildEmbeddingTaskConfigRow(model: string): {
  task: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  isActive: boolean;
} {
  return {
    task: 'embedding',
    model,
    temperature: 0,
    maxOutputTokens: 1,
    isActive: true,
  };
}
