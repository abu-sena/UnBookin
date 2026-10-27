import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { aiTaskConfigs } from '@/db/schema';
import { SourceError } from '@/lib/sources/errors';

export type TaskConfig = {
  model: string;
  fallbackModel: string | null;
  temperature: number;
  maxOutputTokens: number;
};

const cache = new Map<string, { config: TaskConfig; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function resetTaskConfigCache(): void {
  cache.clear();
}

/** Only successful active configurations are cached, independently per task. */
export async function getTaskConfig(task: string): Promise<TaskConfig> {
  const cached = cache.get(task);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.config };
  cache.delete(task);

  try {
    const [row] = await db
      .select({
        model: aiTaskConfigs.model,
        fallbackModel: aiTaskConfigs.fallbackModel,
        temperature: aiTaskConfigs.temperature,
        maxOutputTokens: aiTaskConfigs.maxOutputTokens,
      })
      .from(aiTaskConfigs)
      .where(and(eq(aiTaskConfigs.task, task), eq(aiTaskConfigs.isActive, true)))
      .limit(1);
    const model = row?.model.trim();
    if (!row || !model) throw new SourceError('configurationMissing');
    const config: TaskConfig = {
      model,
      fallbackModel: row.fallbackModel?.trim() || null,
      temperature: row.temperature,
      maxOutputTokens: row.maxOutputTokens,
    };
    cache.set(task, { config, expiresAt: Date.now() + CACHE_TTL_MS });
    return { ...config };
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError('generationUnavailable');
  }
}
