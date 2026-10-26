import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db', () => ({ db: {} }));

import { getMyLibrary } from '@/lib/library/query';
import { createRecordingDatabase } from './recording-db';

const sessionUser = {
  id: 'user-1',
  name: 'Sena',
  email: 'sena@example.com',
  image: null,
  role: 'user' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(sessionUser);
});

describe('getMyLibrary', () => {
  it('uses the session user for every query and aggregates reading progress without duplicates', async () => {
    const { database, queries } = createRecordingDatabase([
      [{ slug: 'leadership-management', name: 'Kepemimpinan dan Manajemen' }],
      [
        {
          id: 'unbook-1',
          title: 'Good to Great',
          author: null,
          interestName: 'Kepemimpinan dan Manajemen',
          interestSlug: 'leadership-management',
          status: 'ready',
        },
      ],
      [
        { unbookId: 'unbook-1', moduleId: 'module-1', progressStatus: 'read' },
        { unbookId: 'unbook-1', moduleId: 'module-1', progressStatus: 'read' },
        { unbookId: 'unbook-1', moduleId: 'module-2', progressStatus: 'not_started' },
        { unbookId: 'unbook-1', moduleId: 'module-3', progressStatus: null },
      ],
    ]);

    const data = await getMyLibrary({ q: '', interest: '', status: '' }, database);

    expect(mocks.requireUser).toHaveBeenCalledWith('/library');
    expect(data.hasAnyUnbooks).toBe(true);
    expect(data.items).toEqual([
      {
        id: 'unbook-1',
        title: 'Good to Great',
        author: null,
        interestName: 'Kepemimpinan dan Manajemen',
        interestSlug: 'leadership-management',
        status: 'ready',
        modulesRead: 1,
        moduleCount: 3,
      },
    ]);

    expect(queries).toHaveLength(3);
    const [optionsQuery, unbookQuery, progressQuery] = queries;

    expect(optionsQuery?.sql).toContain('from "unbooks"');
    expect(optionsQuery?.sql).toMatch(/"unbooks"\."user_id" = \$\d+/);
    expect(optionsQuery?.params).toContain('user-1');

    expect(unbookQuery?.sql).toMatch(/"unbooks"\."user_id" = \$\d+/);
    expect(unbookQuery?.sql).toMatch(/left join "sources"/);
    expect(unbookQuery?.sql).toMatch(/"sources"\."user_id" = \$\d+/);
    expect(unbookQuery?.params).toContain('user-1');

    expect(progressQuery?.sql).toMatch(/"unbooks"\."user_id" = \$\d+/);
    expect(progressQuery?.sql).toMatch(/left join "module_progress"/);
    expect(progressQuery?.sql).toMatch(/"module_progress"\."user_id" = \$\d+/);
    expect(progressQuery?.params.filter((param) => param === 'user-1')).toHaveLength(2);
  });

  it('passes combined filters as escaped ILIKE and status/interest predicates', async () => {
    const { database, queries } = createRecordingDatabase([
      [{ slug: 'leadership-management', name: 'Kepemimpinan dan Manajemen' }],
      [],
    ]);

    await getMyLibrary(
      { q: ' 100%_done\\ ', interest: 'leadership-management', status: 'ready' },
      database,
    );

    const unbookQuery = queries[1];
    expect(unbookQuery?.sql).toContain('ilike');
    expect(unbookQuery?.sql).toMatch(/"interests"\."slug" = \$\d+/);
    expect(unbookQuery?.sql).toMatch(/"unbooks"\."status" = \$\d+/);
    expect(unbookQuery?.params).toEqual(
      expect.arrayContaining(['user-1', '%100\\%\\_done\\\\%', 'leadership-management', 'ready']),
    );
    expect(queries).toHaveLength(2);
  });

  it('normalises an unknown interest to "all" against the user own options', async () => {
    const { database, queries } = createRecordingDatabase([
      [{ slug: 'leadership-management', name: 'Kepemimpinan dan Manajemen' }],
      [],
    ]);

    const data = await getMyLibrary(
      { q: '', interest: 'another-users-interest', status: '' },
      database,
    );

    expect(data.filters.interest).toBe('');
    expect(data.hasAnyUnbooks).toBe(true);
    expect(queries[1]?.sql).not.toMatch(/"interests"\."slug" = \$\d+/);
  });

  it('returns an empty library without a progress query', async () => {
    const { database, queries } = createRecordingDatabase([[], []]);

    const data = await getMyLibrary({ q: '', interest: '', status: 'ready' }, database);

    expect(mocks.requireUser).toHaveBeenCalledWith('/library');
    expect(data.items).toEqual([]);
    expect(data.hasAnyUnbooks).toBe(false);
    expect(queries).toHaveLength(2);
    expect(queries.every((query) => query.params.includes('user-1'))).toBe(true);
  });
});
