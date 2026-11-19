import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { PlanLimits } from '@/lib/billing/plan-limits';
import { resolveActivePlan, type ActivePlanDatabase } from '@/lib/billing/active-plan';
import { createRecordingDatabase } from '../library/recording-db';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const NOW = new Date('2026-11-19T08:00:00.000Z');
const END = new Date('2026-12-19T08:00:00.000Z');

const freeLimits: PlanLimits = {
  unbooksPerMonth: 2,
  unbooksFairUse: 2,
  maxPagesPerSource: 60,
  maxFileMb: 20,
  mentorMessagesPerMonth: 20,
  originalsAccess: 'sample',
  modelTier: 'economy',
};
const proLimits: PlanLimits = {
  unbooksPerMonth: 8,
  unbooksFairUse: 8,
  maxPagesPerSource: 500,
  maxFileMb: 100,
  mentorMessagesPerMonth: 300,
  originalsAccess: 'full',
  modelTier: 'main',
};
const byokLimits: PlanLimits = {
  unbooksPerMonth: null,
  unbooksFairUse: 50,
  maxPagesPerSource: 800,
  maxFileMb: 100,
  mentorMessagesPerMonth: null,
  originalsAccess: 'full',
  modelTier: 'byok',
};

function databaseWith(results: unknown[][]) {
  const { database, queries } = createRecordingDatabase(results);
  return { database: database as unknown as ActivePlanDatabase, queries };
}

describe('resolveActivePlan', () => {
  it('returns the running paid plan and its period end', async () => {
    const { database, queries } = databaseWith([
      [{ planCode: 'pro_monthly', currentPeriodEnd: END }],
      [{ code: 'pro_monthly', limits: proLimits }],
    ]);

    await expect(resolveActivePlan(USER_ID, NOW, database)).resolves.toEqual({
      code: 'pro_monthly',
      limits: proLimits,
      byok: false,
      currentPeriodEnd: END,
    });

    const [subscriptionQuery] = queries;
    expect(subscriptionQuery?.sql).toMatch(/"subscriptions"\."user_id" = \$\d+/);
    expect(subscriptionQuery?.sql).toMatch(/"subscriptions"\."status" = \$\d+/);
    expect(subscriptionQuery?.sql).toMatch(/"subscriptions"\."current_period_start" <= \$\d+/);
    expect(subscriptionQuery?.sql).toMatch(/"subscriptions"\."current_period_end" > \$\d+/);
    expect(subscriptionQuery?.sql).toContain('order by');
    expect(subscriptionQuery?.params).toEqual(
      expect.arrayContaining([USER_ID, 'active', NOW.toISOString()]),
    );
  });

  it('flags BYOK plans', async () => {
    const { database } = databaseWith([
      [{ planCode: 'byok_yearly', currentPeriodEnd: END }],
      [{ code: 'byok_yearly', limits: byokLimits }],
    ]);
    await expect(resolveActivePlan(USER_ID, NOW, database)).resolves.toMatchObject({
      code: 'byok_yearly',
      byok: true,
      currentPeriodEnd: END,
    });
  });

  it('falls back to free when the period expired', async () => {
    const { database } = databaseWith([[], [{ code: 'free', limits: freeLimits }]]);
    await expect(resolveActivePlan(USER_ID, NOW, database)).resolves.toEqual({
      code: 'free',
      limits: freeLimits,
      byok: false,
      currentPeriodEnd: null,
    });
  });

  it('falls back to free when the period starts in the future', async () => {
    const { database } = databaseWith([[], [{ code: 'free', limits: freeLimits }]]);
    const result = await resolveActivePlan(USER_ID, NOW, database);
    expect(result?.code).toBe('free');
    expect(result?.currentPeriodEnd).toBeNull();
  });

  it('falls back to free when the paid plan row is inactive', async () => {
    const { database, queries } = databaseWith([
      [{ planCode: 'pro_monthly', currentPeriodEnd: END }],
      [],
      [{ code: 'free', limits: freeLimits }],
    ]);
    await expect(resolveActivePlan(USER_ID, NOW, database)).resolves.toMatchObject({
      code: 'free',
      byok: false,
      currentPeriodEnd: null,
    });
    expect(queries).toHaveLength(3);
    expect(queries[1]?.params).toContain('pro_monthly');
    expect(queries[2]?.params).toContain('free');
  });

  it('returns null when plan limits are invalid', async () => {
    const { database } = databaseWith([
      [{ planCode: 'pro_monthly', currentPeriodEnd: END }],
      [{ code: 'pro_monthly', limits: { unbooksPerMonth: 'eight' } }],
    ]);
    await expect(resolveActivePlan(USER_ID, NOW, database)).resolves.toBeNull();
  });

  it('returns null when no plan row exists at all', async () => {
    const { database } = databaseWith([[], []]);
    await expect(resolveActivePlan(USER_ID, NOW, database)).resolves.toBeNull();
  });
});
