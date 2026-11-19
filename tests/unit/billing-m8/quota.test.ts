import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { BillingError } from '@/lib/billing/errors';
import type { PlanLimits } from '@/lib/billing/plan-limits';
import { assertQuota, type QuotaDatabase, type QuotaKind } from '@/lib/billing/quota';
import { createRecordingDatabase } from '../library/recording-db';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const NOW = new Date('2026-11-19T08:00:00.000Z');
const END = new Date('2026-12-19T08:00:00.000Z');
const NEXT_MONTH = '2026-11-30T17:00:00.000Z';

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

function databaseWith(results: unknown[][]): QuotaDatabase {
  const { database } = createRecordingDatabase(results);
  return database as unknown as QuotaDatabase;
}

const profileJakarta = [{ timezone: 'Asia/Jakarta' }];

function paid(planCode: 'pro_monthly' | 'pro_yearly') {
  return [{ planCode, currentPeriodEnd: END }];
}

function freePlan() {
  return [{ code: 'free', limits: freeLimits }];
}

function plan(code: string, limits: PlanLimits) {
  return [{ code, limits }];
}

async function codeOf(action: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await action();
  } catch (error) {
    return error instanceof BillingError ? error.code : undefined;
  }
}

describe('assertQuota original', () => {
  it('denies the free plan', async () => {
    const database = databaseWith([[], freePlan()]);
    await expect(assertQuota(USER_ID, 'original', NOW, { database })).resolves.toEqual({
      allowed: false,
      kind: 'original',
      plan: 'free',
      reason: 'planRequired',
      resetsAt: null,
    });
  });

  it('allows every paid plan until the period end', async () => {
    const database = databaseWith([paid('pro_monthly'), plan('pro_monthly', proLimits)]);
    await expect(assertQuota(USER_ID, 'original', NOW, { database })).resolves.toEqual({
      allowed: true,
      kind: 'original',
      plan: 'pro_monthly',
      remaining: null,
      limit: null,
      resetsAt: END,
    });
  });

  it('lets BYOK plans read all Originals too', async () => {
    const database = databaseWith([paid('pro_yearly'), plan('pro_yearly', proLimits)]);
    await expect(assertQuota(USER_ID, 'original', NOW, { database })).resolves.toMatchObject({
      allowed: true,
      plan: 'pro_yearly',
    });
  });
});

describe('assertQuota unbook', () => {
  it('allows the free plan while under its monthly cap', async () => {
    const database = databaseWith([
      [],
      freePlan(),
      profileJakarta,
      [],
      freePlan(),
      [{ unbooksUsed: 0 }],
      [{ value: 0 }],
      profileJakarta,
    ]);

    await expect(assertQuota(USER_ID, 'unbook', NOW, { database })).resolves.toEqual({
      allowed: true,
      kind: 'unbook',
      plan: 'free',
      remaining: 2,
      limit: 2,
      resetsAt: new Date(NEXT_MONTH),
    });
  });

  it('denies when the monthly cap is reached', async () => {
    const database = databaseWith([
      paid('pro_monthly'),
      plan('pro_monthly', proLimits),
      profileJakarta,
      paid('pro_monthly'),
      plan('pro_monthly', proLimits),
      [{ unbooksUsed: 7 }],
      [{ value: 1 }],
      profileJakarta,
    ]);

    await expect(assertQuota(USER_ID, 'unbook', NOW, { database })).resolves.toEqual({
      allowed: false,
      kind: 'unbook',
      plan: 'pro_monthly',
      reason: 'quotaExceeded',
      resetsAt: new Date(NEXT_MONTH),
    });
  });

  it('uses the BYOK fair-use cap of 50 from the plan row', async () => {
    const database = databaseWith([
      paid('pro_monthly'),
      plan('byok_monthly', byokLimits),
      profileJakarta,
      paid('pro_monthly'),
      plan('byok_monthly', byokLimits),
      [{ unbooksUsed: 49 }],
      [{ value: 0 }],
      profileJakarta,
    ]);

    await expect(assertQuota(USER_ID, 'unbook', NOW, { database })).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
      limit: 50,
    });
  });
});

describe('assertQuota mentor_message', () => {
  it('allows the free plan while under its monthly cap', async () => {
    const database = databaseWith([[], freePlan(), profileJakarta, [], freePlan(), [{ used: 0 }]]);

    await expect(assertQuota(USER_ID, 'mentor_message', NOW, { database })).resolves.toEqual({
      allowed: true,
      kind: 'mentor_message',
      plan: 'free',
      remaining: 20,
      limit: 20,
      resetsAt: new Date(NEXT_MONTH),
    });
  });

  it('denies when the mentor cap is reached', async () => {
    const database = databaseWith([
      paid('pro_monthly'),
      plan('pro_monthly', proLimits),
      profileJakarta,
      paid('pro_monthly'),
      plan('pro_monthly', proLimits),
      [{ used: 300 }],
    ]);

    await expect(assertQuota(USER_ID, 'mentor_message', NOW, { database })).resolves.toEqual({
      allowed: false,
      kind: 'mentor_message',
      plan: 'pro_monthly',
      reason: 'quotaExceeded',
      resetsAt: new Date(NEXT_MONTH),
    });
  });

  it('never blocks BYOK mentor messages', async () => {
    const database = databaseWith([
      paid('pro_monthly'),
      plan('byok_monthly', byokLimits),
      profileJakarta,
      paid('pro_monthly'),
      plan('byok_monthly', byokLimits),
      [{ used: 9999 }],
    ]);

    await expect(assertQuota(USER_ID, 'mentor_message', NOW, { database })).resolves.toEqual({
      allowed: true,
      kind: 'mentor_message',
      plan: 'byok_monthly',
      remaining: null,
      limit: null,
      resetsAt: new Date(NEXT_MONTH),
    });
  });
});

describe('assertQuota input and configuration', () => {
  it('rejects an invalid user id without querying', async () => {
    expect(
      await codeOf(() => assertQuota('nope', 'unbook', NOW, { database: databaseWith([]) })),
    ).toBe('invalidInput');
  });

  it('rejects an unknown kind at runtime', async () => {
    expect(
      await codeOf(() =>
        assertQuota(USER_ID, 'video' as QuotaKind, NOW, { database: databaseWith([]) }),
      ),
    ).toBe('invalidInput');
  });

  it('rejects an invalid clock', async () => {
    expect(
      await codeOf(() =>
        assertQuota(USER_ID, 'original', new Date('invalid'), { database: databaseWith([]) }),
      ),
    ).toBe('invalidInput');
  });

  it('reports configurationMissing when no plan row exists', async () => {
    expect(
      await codeOf(() =>
        assertQuota(USER_ID, 'original', NOW, { database: databaseWith([[], []]) }),
      ),
    ).toBe('configurationMissing');
  });
});
