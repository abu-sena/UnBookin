import { describe, expect, it } from 'vitest';
import { BillingError } from '@/lib/billing/errors';
import {
  addMonthsClamped,
  intervalMonths,
  resolveSubscriptionPeriod,
  type CurrentSubscription,
} from '@/lib/billing/subscription-rules';

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof BillingError ? error.code : undefined;
  }
}

const paidAt = new Date('2026-01-15T10:00:00.000Z');

function current(overrides: Partial<CurrentSubscription> = {}): CurrentSubscription {
  return {
    planCode: 'pro_monthly',
    currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('addMonthsClamped', () => {
  it('adds calendar months without losing time of day', () => {
    expect(addMonthsClamped(new Date('2026-01-15T10:20:30.400Z'), 1).toISOString()).toBe(
      '2026-02-15T10:20:30.400Z',
    );
    expect(addMonthsClamped(new Date('2026-01-15T10:20:30.400Z'), 12).toISOString()).toBe(
      '2027-01-15T10:20:30.400Z',
    );
  });

  it('clamps month-end to the last day of the shorter month', () => {
    expect(addMonthsClamped(new Date('2026-01-31T00:00:00.000Z'), 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
    expect(addMonthsClamped(new Date('2028-01-31T00:00:00.000Z'), 1).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
    expect(addMonthsClamped(new Date('2026-03-31T00:00:00.000Z'), 1).toISOString()).toBe(
      '2026-04-30T00:00:00.000Z',
    );
  });

  it('clamps a leap day when adding a year', () => {
    expect(addMonthsClamped(new Date('2028-02-29T08:00:00.000Z'), 12).toISOString()).toBe(
      '2029-02-28T08:00:00.000Z',
    );
  });

  it('rejects invalid dates and non-integer months', () => {
    expect(codeOf(() => addMonthsClamped(new Date('invalid'), 1))).toBe('invalidInput');
    expect(codeOf(() => addMonthsClamped(paidAt, 1.5))).toBe('invalidInput');
  });
});

describe('intervalMonths', () => {
  it('maps the plan interval to calendar months', () => {
    expect(intervalMonths('month')).toBe(1);
    expect(intervalMonths('year')).toBe(12);
  });
});

describe('resolveSubscriptionPeriod', () => {
  it('starts a first purchase at the paid time and ends one month later', () => {
    const period = resolveSubscriptionPeriod({
      current: null,
      planCode: 'pro_monthly',
      interval: 'month',
      paidAt,
    });
    expect(period).toEqual({
      start: paidAt,
      end: new Date('2026-02-15T10:00:00.000Z'),
      previousEndsAt: null,
      extendsCurrent: false,
    });
  });

  it('uses calendar month end for a first purchase on the 31st', () => {
    const period = resolveSubscriptionPeriod({
      current: null,
      planCode: 'pro_monthly',
      interval: 'month',
      paidAt: new Date('2026-01-31T23:30:00.000Z'),
    });
    expect(period.end.toISOString()).toBe('2026-02-28T23:30:00.000Z');
  });

  it('supports yearly intervals', () => {
    const period = resolveSubscriptionPeriod({
      current: null,
      planCode: 'pro_yearly',
      interval: 'year',
      paidAt: new Date('2026-03-10T12:00:00.000Z'),
    });
    expect(period.end.toISOString()).toBe('2027-03-10T12:00:00.000Z');
  });

  it('extends the same plan from the running period end', () => {
    const running = current({ currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z') });
    const period = resolveSubscriptionPeriod({
      current: running,
      planCode: 'pro_monthly',
      interval: 'month',
      paidAt,
    });
    expect(period.start).toEqual(running.currentPeriodEnd);
    expect(period.end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(period.extendsCurrent).toBe(true);
    expect(period.previousEndsAt).toBeNull();
  });

  it('extends a yearly plan by a full year', () => {
    const running = current({
      planCode: 'pro_yearly',
      currentPeriodEnd: new Date('2026-03-10T12:00:00.000Z'),
    });
    const period = resolveSubscriptionPeriod({
      current: running,
      planCode: 'pro_yearly',
      interval: 'year',
      paidAt,
    });
    expect(period.end.toISOString()).toBe('2027-03-10T12:00:00.000Z');
    expect(period.extendsCurrent).toBe(true);
  });

  it('starts at the paid time when a same-plan period already expired', () => {
    const expired = current({ currentPeriodEnd: new Date('2026-01-10T00:00:00.000Z') });
    const period = resolveSubscriptionPeriod({
      current: expired,
      planCode: 'pro_monthly',
      interval: 'month',
      paidAt,
    });
    expect(period.start).toEqual(paidAt);
    expect(period.end.toISOString()).toBe('2026-02-15T10:00:00.000Z');
    expect(period.extendsCurrent).toBe(false);
    expect(period.previousEndsAt).toBeNull();
  });

  it('treats the exact period end as expired', () => {
    const boundary = current({ currentPeriodEnd: new Date(paidAt) });
    const period = resolveSubscriptionPeriod({
      current: boundary,
      planCode: 'pro_monthly',
      interval: 'month',
      paidAt,
    });
    expect(period.start).toEqual(paidAt);
    expect(period.extendsCurrent).toBe(false);
  });

  it('switches plan immediately and ends the previous period at the paid time', () => {
    const running = current({ currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z') });
    const period = resolveSubscriptionPeriod({
      current: running,
      planCode: 'pro_yearly',
      interval: 'year',
      paidAt,
    });
    expect(period.start).toEqual(paidAt);
    expect(period.end.toISOString()).toBe('2027-01-15T10:00:00.000Z');
    expect(period.previousEndsAt).toEqual(paidAt);
    expect(period.extendsCurrent).toBe(false);
  });

  it('does not touch an already expired different plan', () => {
    const expired = current({ currentPeriodEnd: new Date('2026-01-01T00:00:00.000Z') });
    const period = resolveSubscriptionPeriod({
      current: expired,
      planCode: 'byok_monthly',
      interval: 'month',
      paidAt,
    });
    expect(period.previousEndsAt).toBeNull();
  });

  it('never activates the free plan', () => {
    expect(
      codeOf(() =>
        resolveSubscriptionPeriod({
          current: null,
          planCode: 'free',
          interval: 'month',
          paidAt,
        }),
      ),
    ).toBe('freePlanNotPurchasable');
    expect(
      codeOf(() =>
        resolveSubscriptionPeriod({
          current: current(),
          planCode: 'free',
          interval: 'month',
          paidAt,
        }),
      ),
    ).toBe('freePlanNotPurchasable');
  });

  it('rejects an invalid paid time', () => {
    expect(
      codeOf(() =>
        resolveSubscriptionPeriod({
          current: null,
          planCode: 'pro_monthly',
          interval: 'month',
          paidAt: new Date('invalid'),
        }),
      ),
    ).toBe('invalidInput');
  });
});
