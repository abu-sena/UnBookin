import { describe, expect, it, vi } from 'vitest';
import type { PlanLimits } from '@/lib/billing/plan-limits';

vi.mock('server-only', () => ({}));

import {
  computeMentorAllowance,
  getMentorAllowance,
  nextLocalMonthStart,
  usageAfterRefund,
} from '@/lib/billing/mentor-quota';
import { createRecordingDatabase } from '../library/recording-db';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';

const freeLimits: PlanLimits = {
  unbooksPerMonth: 2,
  unbooksFairUse: 50,
  maxPagesPerSource: 60,
  maxFileMb: 20,
  mentorMessagesPerMonth: 20,
  originalsAccess: 'sample',
  modelTier: 'economy',
};

const proLimits: PlanLimits = {
  ...freeLimits,
  mentorMessagesPerMonth: 300,
  originalsAccess: 'full',
  modelTier: 'main',
};

function allowanceFor(results: unknown[][], now: Date) {
  const { database, queries } = createRecordingDatabase(results);
  return {
    queries,
    result: getMentorAllowance(USER_ID, now, { database: database as never }),
  };
}

describe('refill instant', () => {
  it('is the first local instant of the next month across a year end', () => {
    const resetsAt = nextLocalMonthStart(new Date('2026-12-15T05:00:00Z'), 'Asia/Jakarta');
    expect(resetsAt.toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });

  it('handles a DST offset change between months', () => {
    const winter = nextLocalMonthStart(new Date('2026-01-15T12:00:00Z'), 'America/New_York');
    expect(winter.toISOString()).toBe('2026-02-01T05:00:00.000Z');

    const spring = nextLocalMonthStart(new Date('2026-03-15T12:00:00Z'), 'America/New_York');
    expect(spring.toISOString()).toBe('2026-04-01T04:00:00.000Z');
  });
});

describe('pure allowance rules', () => {
  it('subtracts used from a finite limit and clamps at zero', () => {
    const allowance = computeMentorAllowance({
      limit: 20,
      used: 5,
      now: new Date('2026-10-15T05:00:00Z'),
      timeZone: 'Asia/Jakarta',
    });
    expect(allowance).toMatchObject({ limit: 20, used: 5, remaining: 15, period: '2026-10' });

    const exhausted = computeMentorAllowance({
      limit: 20,
      used: 25,
      now: new Date('2026-10-15T05:00:00Z'),
      timeZone: 'Asia/Jakarta',
    });
    expect(exhausted.remaining).toBe(0);
  });

  it('never blocks a null (BYOK) limit but still reports usage', () => {
    const allowance = computeMentorAllowance({
      limit: null,
      used: 123,
      now: new Date('2026-10-15T05:00:00Z'),
      timeZone: 'Asia/Jakarta',
    });
    expect(allowance).toMatchObject({ limit: null, used: 123, remaining: null });
  });

  it('never refunds below zero', () => {
    expect(usageAfterRefund(0)).toBe(0);
    expect(usageAfterRefund(1)).toBe(0);
    expect(usageAfterRefund(7)).toBe(6);
  });
});

describe('getMentorAllowance', () => {
  it('uses the active subscription plan and the profile local month', async () => {
    const { result, queries } = allowanceFor(
      [
        [{ timezone: 'Asia/Jakarta' }],
        [{ planCode: 'pro_monthly' }],
        [{ code: 'pro_monthly', limits: proLimits }],
        [{ used: 12 }],
      ],
      new Date('2026-10-31T18:30:00Z'),
    );

    await expect(result).resolves.toMatchObject({
      limit: 300,
      used: 12,
      remaining: 288,
      period: '2026-11',
    });
    expect(queries[1]?.sql).toMatch(/"subscriptions"\."user_id" = \$\d+/);
    expect(queries[2]?.params).toContain('pro_monthly');
  });

  it('falls back to free when no subscription covers now', async () => {
    const { result, queries } = allowanceFor(
      [[{ timezone: 'Asia/Jakarta' }], [], [{ code: 'free', limits: freeLimits }], [{ used: 20 }]],
      new Date('2026-10-15T05:00:00Z'),
    );

    await expect(result).resolves.toMatchObject({ limit: 20, used: 20, remaining: 0 });
    expect(queries[2]?.params).toContain('free');
  });

  it('rejects a client-like invalid user id before querying', async () => {
    const { database, queries } = createRecordingDatabase([]);
    await expect(
      getMentorAllowance('not-a-uuid', new Date(), { database: database as never }),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    expect(queries).toHaveLength(0);
  });
});
