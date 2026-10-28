import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const captured: {
    config?: unknown;
    handler?: (args: { step: unknown }) => Promise<unknown>;
  } = {};
  const createFunction = vi.fn((config: unknown, handler: unknown) => {
    captured.config = config;
    captured.handler = handler as (args: { step: unknown }) => Promise<unknown>;
    return { id: 'weekly-missions' };
  });
  const profileRows: { userId: string; timezone: string }[][] = [];
  const query = {
    from: () => query,
    where: () => query,
    orderBy: () => query,
    limit: async () => profileRows.shift() ?? [],
  };
  return {
    captured,
    createFunction,
    profileRows,
    select: vi.fn(() => query),
    reconcileUserGame: vi.fn(async () => ({})),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/inngest/client', () => ({ inngest: { createFunction: mocks.createFunction } }));
vi.mock('@/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/game/engine', () => ({ reconcileUserGame: mocks.reconcileUserGame }));

await import('@/inngest/weekly-missions');

const JAKARTA_USER = '11111111-1111-4111-8111-111111111111';
const LA_USER = '22222222-2222-4222-8222-222222222222';
const BAD_ZONE_USER = '33333333-3333-4333-8333-333333333333';

function fakeStep() {
  const ids: string[] = [];
  return {
    ids,
    step: {
      run: async <T>(id: string, callback: () => Promise<T> | T): Promise<T> => {
        ids.push(id);
        return callback();
      },
    },
  };
}

beforeEach(() => {
  mocks.reconcileUserGame.mockClear();
  mocks.profileRows.length = 0;
});

describe('weeklyMissions function registration', () => {
  it('registers an hourly cron trigger with the v4 triggers signature', () => {
    expect(mocks.captured.config).toMatchObject({
      id: 'weekly-missions',
      triggers: [{ cron: '0 * * * *' }],
    });
  });
});

describe('weeklyMissions handler', () => {
  it('reconciles only users whose local clock is Monday midnight, one step per user', async () => {
    vi.useFakeTimers();
    // Sun 17:00Z = Monday 00:00 Jakarta, Sunday 10:00 in Los Angeles.
    vi.setSystemTime(new Date('2026-10-25T17:00:00Z'));
    mocks.profileRows.push([
      { userId: JAKARTA_USER, timezone: 'Asia/Jakarta' },
      { userId: LA_USER, timezone: 'America/Los_Angeles' },
      { userId: BAD_ZONE_USER, timezone: 'Not/AZone' },
    ]);
    const { step, ids } = fakeStep();
    const result = await mocks.captured.handler!({ step });
    vi.useRealTimers();

    // The invalid zone falls back to Asia/Jakarta, which is at Monday midnight.
    expect(result).toEqual({ reconciled: 2 });
    expect(mocks.reconcileUserGame.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      JAKARTA_USER,
      BAD_ZONE_USER,
    ]);
    expect(ids).toEqual([
      'tick',
      'select-local-monday',
      `reconcile-${JAKARTA_USER}`,
      `reconcile-${BAD_ZONE_USER}`,
    ]);
    // Step payloads carry no user content, only ids and a boolean/timestamp.
    expect(JSON.stringify(ids)).not.toMatch(/timezone|name|email/i);
  });

  it('does nothing when nobody is at Monday midnight and pages with a keyset', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T05:00:00Z'));
    const full = Array.from({ length: 200 }, (_, index) => ({
      userId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      timezone: 'UTC',
    }));
    mocks.profileRows.push(full, [{ userId: LA_USER, timezone: 'UTC' }]);
    const { step } = fakeStep();
    const result = await mocks.captured.handler!({ step });
    vi.useRealTimers();

    expect(result).toEqual({ reconciled: 0 });
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.reconcileUserGame).not.toHaveBeenCalled();
  });
});
