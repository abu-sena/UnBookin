import 'server-only';
import { notFound } from 'next/navigation';
import { ModuleContent } from '@/lib/engine/module-content';
import { LearningError } from '@/lib/learning/errors';
import type { LearningIdentity } from '@/lib/learning/identity';
import { getModuleForReading, type ModuleForReading } from '@/lib/learning/queries';

export type ReaderModuleData = Omit<ModuleForReading, 'content'> & { content: ModuleContent };

/**
 * E4-02: load one module for the reader. The module must belong to the Unbook
 * in the URL, so a module id from another Unbook is a 404 rather than a view.
 */
export async function loadReaderModule(
  identity: LearningIdentity,
  unbookId: string,
  moduleId: string,
): Promise<ReaderModuleData> {
  let data: ModuleForReading;
  try {
    data = await getModuleForReading(identity, { moduleId });
  } catch (error) {
    if (error instanceof LearningError && error.code === 'notFound') notFound();
    throw error;
  }

  if (data.unbookId !== unbookId) notFound();

  const parsed = ModuleContent.safeParse(data.content);
  if (!parsed.success) throw new LearningError('failed');

  return { ...data, content: parsed.data };
}
