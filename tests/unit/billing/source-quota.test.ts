import { describe, expect, it, vi } from 'vitest';
import type { PlanLimits } from '@/lib/billing/plan-limits';
import {
  estimatePageCountFromWords,
  getLocalMonthPeriod,
  getRemainingUnbooks,
  getSourceAllowance,
  getUnbookCapacity,
  resolveTimeZone,
  validateSourceFileSize,
  validateSourcePageCount,
  type SourceQuotaDatabase,
} from '@/lib/billing/source-quota';
import { createRecordingDatabase } from '../library/recording-db';

vi.mock('server-only', () => ({}));

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const OTHER_UNBOOK_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

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
  unbooksPerMonth: 8,
  unbooksFairUse: 50,
  maxPagesPerSource: 500,
  maxFileMb: 100,
  mentorMessagesPerMonth: 300,
  originalsAccess: 'full',
  modelTier: 'main',
};

function thrownCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

function profileRow(timezone = 'Asia/Jakarta') {
  return [{ timezone }];
}

function subscriptionRow(planCode: 'free' | 'pro_monthly' | 'pro_yearly') {
  return [{ planCode }];
}

function planRow(code: 'free' | 'pro_monthly' | 'pro_yearly', limits: unknown = freeLimits) {
  return [{ code, limits }];
}

function allowanceFor(results: unknown[][], now = new Date('2026-10-15T05:00:00Z')) {
  const { database, queries } = createRecordingDatabase(results);
  return {
    queries,
    result: getSourceAllowance(USER_ID, now, {
      database: database as unknown as SourceQuotaDatabase,
    }),
  };
}

describe('local quota period', () => {
  it('uses the user local calendar, not UTC', () => {
    const endOfOctoberUtc = new Date('2026-10-31T18:30:00Z');
    expect(getLocalMonthPeriod(endOfOctoberUtc, 'Asia/Jakarta')).toBe('2026-11');
    expect(getLocalMonthPeriod(endOfOctoberUtc, 'UTC')).toBe('2026-10');
    expect(getLocalMonthPeriod(endOfOctoberUtc, 'America/Los_Angeles')).toBe('2026-10');

    const startOfNovemberUtc = new Date('2026-11-01T00:00:00Z');
    expect(getLocalMonthPeriod(startOfNovemberUtc, 'Asia/Jakarta')).toBe('2026-11');
  });

  it('validates IANA zones and falls back to Asia/Jakarta', () => {
    expect(resolveTimeZone('America/New_York')).toBe('America/New_York');
    expect(resolveTimeZone('Not/AZone')).toBe('Asia/Jakarta');
    expect(resolveTimeZone('')).toBe('Asia/Jakarta');
    expect(resolveTimeZone(null)).toBe('Asia/Jakarta');
  });
});

describe('getSourceAllowance', () => {
  it('loads the profile month, free plan, own usage and own pending Unbooks', async () => {
    const { result, queries } = allowanceFor(
      [profileRow(), [], planRow('free'), [{ unbooksUsed: 1 }], [{ value: 1 }]],
      new Date('2026-10-31T18:30:00Z'),
    );

    await expect(result).resolves.toEqual({
      planCode: 'free',
      limits: freeLimits,
      period: '2026-11',
      unbooksUsed: 1,
      unbooksPending: 1,
      remaining: 0,
    });

    const [profileQuery, subscriptionQuery, planQuery, usageQuery, pendingQuery] = queries;
    expect(profileQuery?.sql).toMatch(/"profiles"\."user_id" = \$\d+/);
    expect(profileQuery?.params).toContain(USER_ID);

    expect(subscriptionQuery?.sql).toMatch(/"subscriptions"\."user_id" = \$\d+/);
    expect(subscriptionQuery?.sql).toMatch(/"subscriptions"\."status" = \$\d+/);
    expect(subscriptionQuery?.sql).toMatch(/"subscriptions"\."current_period_start" <= \$\d+/);
    expect(subscriptionQuery?.sql).toMatch(/"subscriptions"\."current_period_end" > \$\d+/);
    expect(subscriptionQuery?.params).toContain('active');

    expect(planQuery?.sql).toMatch(/"plans"\."code" = \$\d+/);
    expect(planQuery?.sql).toMatch(/"plans"\."is_active" = \$\d+/);
    expect(planQuery?.params).toContain('free');

    expect(usageQuery?.sql).toMatch(/"usage_counters"\."user_id" = \$\d+/);
    expect(usageQuery?.sql).toMatch(/"usage_counters"\."period" = \$\d+/);
    expect(usageQuery?.params).toContain(USER_ID);
    expect(usageQuery?.params).toContain('2026-11');

    expect(pendingQuery?.sql).toContain('count(*)');
    expect(pendingQuery?.sql).toMatch(/"unbooks"\."user_id" = \$\d+/);
    expect(pendingQuery?.sql).toMatch(/"unbooks"\."status" in/);
    expect(pendingQuery?.params).toEqual(
      expect.arrayContaining([USER_ID, 'queued', 'outlining', 'generating']),
    );
  });

  it('uses the current active subscription plan when one covers now', async () => {
    const { result, queries } = allowanceFor([
      profileRow(),
      subscriptionRow('pro_monthly'),
      planRow('pro_monthly', proLimits),
      [{ unbooksUsed: 0 }],
      [{ value: 0 }],
    ]);

    await expect(result).resolves.toMatchObject({
      planCode: 'pro_monthly',
      limits: proLimits,
      remaining: 8,
    });
    expect(queries[2]?.params).toContain('pro_monthly');
  });

  it('falls back to free when no subscription covers now', async () => {
    const { result, queries } = allowanceFor([
      profileRow(),
      [],
      planRow('free'),
      [{ unbooksUsed: 0 }],
      [{ value: 0 }],
    ]);

    await expect(result).resolves.toMatchObject({ planCode: 'free', remaining: 2 });
    expect(queries).toHaveLength(5);
  });

  it('falls back to free when the subscription plan row is missing or inactive', async () => {
    const { result, queries } = allowanceFor([
      profileRow(),
      subscriptionRow('pro_monthly'),
      [],
      planRow('free'),
      [{ unbooksUsed: 0 }],
      [{ value: 0 }],
    ]);

    await expect(result).resolves.toMatchObject({ planCode: 'free' });
    expect(queries[3]?.params).toContain('free');
  });

  it('uses fair use when the monthly quota is null and clamps remaining at zero', async () => {
    const fairUseLimits: PlanLimits = { ...freeLimits, unbooksPerMonth: null, unbooksFairUse: 50 };
    const { result } = allowanceFor([
      profileRow(),
      [],
      planRow('free', fairUseLimits),
      [{ unbooksUsed: 2 }],
      [{ value: 1 }],
    ]);

    await expect(result).resolves.toMatchObject({
      limits: fairUseLimits,
      remaining: 47,
    });
    expect(getUnbookCapacity(fairUseLimits)).toBe(50);
    expect(getRemainingUnbooks(freeLimits, 9, 9)).toBe(0);
  });

  it('validates a profile IANA zone and applies the Jakarta month boundary', async () => {
    const { result } = allowanceFor(
      [profileRow('Mars/Olympus'), [], planRow('free'), [{ unbooksUsed: 0 }], [{ value: 0 }]],
      new Date('2026-10-31T18:30:00Z'),
    );

    await expect(result).resolves.toMatchObject({ period: '2026-11' });
  });

  it('excludes a retried Unbook from the pending count', async () => {
    const withExclude = createRecordingDatabase([
      profileRow(),
      [],
      planRow('free'),
      [{ unbooksUsed: 0 }],
      [{ value: 0 }],
    ]);
    const result = await getSourceAllowance(USER_ID, new Date('2026-10-15T05:00:00Z'), {
      database: withExclude.database as unknown as SourceQuotaDatabase,
      excludeUnbookId: OTHER_UNBOOK_ID,
    });

    expect(result.unbooksPending).toBe(0);
    const pendingQuery = withExclude.queries[4];
    expect(pendingQuery?.sql).toMatch(/"unbooks"\."id" <>/);
    expect(pendingQuery?.params).toContain(OTHER_UNBOOK_ID);
  });

  it('fails safely when no active free plan is configured or its limits are invalid', async () => {
    const missing = allowanceFor([profileRow(), [], []]);
    await expect(missing.result).rejects.toMatchObject({ code: 'configurationMissing' });

    const invalid = allowanceFor([
      profileRow(),
      [],
      planRow('free', { ...freeLimits, maxFileMb: 0 }),
    ]);
    await expect(invalid.result).rejects.toMatchObject({ code: 'configurationMissing' });
  });

  it('rejects a client-like invalid user id before querying', async () => {
    const { database, queries } = createRecordingDatabase([]);
    await expect(
      getSourceAllowance('not-a-uuid', new Date(), {
        database: database as unknown as SourceQuotaDatabase,
      }),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    expect(queries).toHaveLength(0);
  });
});

describe('file and page validators', () => {
  it('treats both plan limits as inclusive', () => {
    expect(thrownCode(() => validateSourceFileSize(freeLimits, 20 * 1024 * 1024))).toBeUndefined();
    expect(thrownCode(() => validateSourceFileSize(freeLimits, 20 * 1024 * 1024 + 1))).toBe(
      'fileTooLarge',
    );
    expect(thrownCode(() => validateSourcePageCount(freeLimits, 60))).toBeUndefined();
    expect(thrownCode(() => validateSourcePageCount(freeLimits, 61))).toBe('pagesExceeded');
  });

  it('rejects negative or fractional values as invalid input', () => {
    expect(thrownCode(() => validateSourceFileSize(freeLimits, -1))).toBe('invalidInput');
    expect(thrownCode(() => validateSourcePageCount(freeLimits, 1.5))).toBe('invalidInput');
  });

  it('estimates EPUB/URL pages from words at 300 words per page', () => {
    expect(estimatePageCountFromWords(0)).toBe(0);
    expect(estimatePageCountFromWords(300)).toBe(1);
    expect(estimatePageCountFromWords(301)).toBe(2);
    expect(thrownCode(() => estimatePageCountFromWords(-1))).toBe('invalidInput');
  });
});
