import { ModuleReader } from '@/components/reader/module-reader';
import { loadReaderModule } from '@/components/reader/module-page-data';
import { requireUser } from '@/lib/auth/session';
import { LearningError } from '@/lib/learning/errors';
import { getUnbookPath } from '@/lib/learning/queries';

type ModulePageProps = {
  // Next.js 16: `params` is async.
  params: Promise<{ unbookId: string; moduleId: string }>;
};

export default async function ModulePage({ params }: ModulePageProps) {
  const { unbookId, moduleId } = await params;
  const user = await requireUser(`/unbook/${unbookId}/module/${moduleId}`);
  const identity = { userId: user.id };

  const moduleData = await loadReaderModule(identity, unbookId, moduleId);

  let nextModuleId: string | null = null;
  try {
    const path = await getUnbookPath(identity, { unbookId });
    const index = path.modules.findIndex((node) => node.moduleId === moduleData.moduleId);
    nextModuleId = index >= 0 ? (path.modules[index + 1]?.moduleId ?? null) : null;
  } catch (error) {
    // The next link is optional; only a real failure should break the module page.
    if (!(error instanceof LearningError)) throw error;
  }

  return <ModuleReader {...moduleData} nextModuleId={nextModuleId} />;
}
