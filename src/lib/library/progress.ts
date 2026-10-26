export type ModuleProgressStatus = 'not_started' | 'reading' | 'read';

export type ModuleProgressRow = {
  unbookId: string;
  moduleId: string;
  progressStatus: ModuleProgressStatus | null;
};

export type ModuleProgressSummary = {
  modulesRead: number;
  moduleCount: number;
};

/**
 * Aggregate module rows per Unbook using sets, so duplicate progress rows or
 * repeated joins can never inflate the counts. Modules without a progress row
 * still count toward the total.
 */
export function aggregateModuleProgress(
  rows: readonly ModuleProgressRow[],
): Map<string, ModuleProgressSummary> {
  const allModules = new Map<string, Set<string>>();
  const readModules = new Map<string, Set<string>>();

  for (const row of rows) {
    const modules = allModules.get(row.unbookId) ?? new Set<string>();
    modules.add(row.moduleId);
    allModules.set(row.unbookId, modules);

    if (row.progressStatus === 'read') {
      const read = readModules.get(row.unbookId) ?? new Set<string>();
      read.add(row.moduleId);
      readModules.set(row.unbookId, read);
    }
  }

  const summaries = new Map<string, ModuleProgressSummary>();
  for (const [unbookId, moduleIds] of allModules) {
    summaries.set(unbookId, {
      modulesRead: Math.min(readModules.get(unbookId)?.size ?? 0, moduleIds.size),
      moduleCount: moduleIds.size,
    });
  }
  return summaries;
}
