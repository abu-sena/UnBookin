import { describe, expect, it } from 'vitest';
import { aggregateModuleProgress, type ModuleProgressRow } from '@/lib/library/progress';

describe('aggregateModuleProgress', () => {
  it('counts distinct modules even when the same progress row repeats', () => {
    const rows: ModuleProgressRow[] = [
      { unbookId: 'a', moduleId: 'm1', progressStatus: 'read' },
      { unbookId: 'a', moduleId: 'm1', progressStatus: 'read' },
      { unbookId: 'a', moduleId: 'm2', progressStatus: 'reading' },
      { unbookId: 'a', moduleId: 'm3', progressStatus: null },
    ];

    expect(aggregateModuleProgress(rows).get('a')).toEqual({
      modulesRead: 1,
      moduleCount: 3,
    });
  });

  it('counts a module as read when any progress row reached read', () => {
    const rows: ModuleProgressRow[] = [
      { unbookId: 'b', moduleId: 'm1', progressStatus: 'reading' },
      { unbookId: 'b', moduleId: 'm1', progressStatus: 'read' },
      { unbookId: 'b', moduleId: 'm2', progressStatus: 'read' },
    ];

    expect(aggregateModuleProgress(rows).get('b')).toEqual({
      modulesRead: 2,
      moduleCount: 2,
    });
  });

  it('returns no summary for an Unbook with no module rows', () => {
    const rows: ModuleProgressRow[] = [{ unbookId: 'c', moduleId: 'm1', progressStatus: 'read' }];

    expect(aggregateModuleProgress(rows).get('missing')).toBeUndefined();
  });
});
