import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/db', () => ({ db: { select: mocks.select } }));

import { getMyProfileSummary } from '@/lib/profile/summary';

type Chain = {
  from: () => Chain;
  leftJoin: () => Chain;
  innerJoin: () => Chain;
  where: () => Chain;
  orderBy: () => Chain;
  limit: () => Promise<unknown[]>;
};

/** Queues one result set per `db.select()` call in `getMyProfileSummary`. */
function queueRows(...results: unknown[][]) {
  mocks.select.mockImplementation(() => {
    const rows = results.shift() ?? [];
    const chain: Chain = {
      from: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => rows,
    };
    return chain;
  });
}

const user = {
  id: 'user-1',
  name: 'Sena',
  email: 'sena@example.com',
  image: null,
  role: 'user' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
});

describe('getMyProfileSummary', () => {
  it('maps a missing user_stats row to zeros', async () => {
    queueRows(
      [{ displayName: 'Sena Belajar' }],
      [],
      [
        {
          id: 'badge-1',
          slug: 'first-step',
          name: 'Langkah Pertama',
          description: 'Selesaikan Unbook pertama.',
          icon: 'footprints',
          tier: 'bronze',
          earnedAt: null,
        },
      ],
      [{ value: 0 }],
      [{ value: 0 }],
      [{ value: 0 }],
    );

    const summary = await getMyProfileSummary();

    expect(summary.level).toBe(1);
    expect(summary.totalXp).toBe(0);
    expect(summary.longestStreak).toBe(0);
    expect(summary.stats).toEqual({ modulesRead: 0, quizzesPassed: 0, verifiedActions: 0 });
    expect(summary.displayName).toBe('Sena Belajar');
    expect(summary.badges).toHaveLength(1);
    expect(summary.badges[0]?.earnedAt).toBeNull();
  });

  it('keeps stats and earned badges when the rows exist', async () => {
    const earnedAt = new Date('2026-10-01T10:00:00Z');
    queueRows(
      [{ displayName: null }],
      [{ level: 7, totalXp: 2340, longestStreak: 12 }],
      [
        {
          id: 'badge-1',
          slug: 'first-step',
          name: 'Langkah Pertama',
          description: 'Selesaikan Unbook pertama.',
          icon: 'footprints',
          tier: 'bronze',
          earnedAt,
        },
      ],
      [{ value: '4' }],
      [{ value: '3' }],
      [{ value: '2' }],
    );

    const summary = await getMyProfileSummary();

    expect(summary.level).toBe(7);
    expect(summary.totalXp).toBe(2340);
    expect(summary.longestStreak).toBe(12);
    expect(summary.stats).toEqual({ modulesRead: 4, quizzesPassed: 3, verifiedActions: 2 });
    expect(summary.badges[0]?.earnedAt).toBe(earnedAt);
    expect(summary.user).toEqual({ name: 'Sena', image: null });
  });
});
