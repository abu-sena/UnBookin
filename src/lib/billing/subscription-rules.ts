import type { Plan } from '@/db/schema';
import { BillingError } from '@/lib/billing/errors';

/**
 * Pure subscription period rules (M8, decisions 2026-11-19):
 * - same plan continues from the running period end (or from the paid time when none/expired);
 * - a different plan starts when paid and the previous remainder is lost;
 * - the free plan is never activated by a payment;
 * - no proration.
 *
 * Arithmetic uses UTC calendar months so DST can never shift a period boundary.
 */
export type SubscriptionInterval = 'month' | 'year';

export type CurrentSubscription = {
  planCode: Plan['code'];
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

export type SubscriptionPeriod = {
  start: Date;
  end: Date;
  /** When a different plan is bought mid-period, the previous row ends at this instant. */
  previousEndsAt: Date | null;
  /** True when the paid plan continues a running period of the same plan. */
  extendsCurrent: boolean;
};

export type ResolveSubscriptionPeriodInput = {
  current: CurrentSubscription | null;
  planCode: Plan['code'];
  interval: SubscriptionInterval;
  paidAt: Date;
};

function assertValidDate(value: Date, code: 'invalidInput'): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new BillingError(code);
  }
}

/**
 * Add whole calendar months, clamping the day to the target month end:
 * 31 Jan + 1 month = last day of Feb; 29 Feb + 1 year = 28 Feb.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  assertValidDate(date, 'invalidInput');
  if (!Number.isInteger(months)) throw new BillingError('invalidInput');

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      targetDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export function intervalMonths(interval: SubscriptionInterval): number {
  if (interval === 'month') return 1;
  if (interval === 'year') return 12;
  throw new BillingError('invalidInput');
}

/** Returns the period a newly paid order must create or extend. */
export function resolveSubscriptionPeriod(
  input: ResolveSubscriptionPeriodInput,
): SubscriptionPeriod {
  assertValidDate(input.paidAt, 'invalidInput');
  if (input.planCode === 'free') throw new BillingError('freePlanNotPurchasable');
  const months = intervalMonths(input.interval);

  const current = input.current;
  if (current) {
    assertValidDate(current.currentPeriodStart, 'invalidInput');
    assertValidDate(current.currentPeriodEnd, 'invalidInput');
  }

  const isRunning = current !== null && current.currentPeriodEnd.getTime() > input.paidAt.getTime();
  const samePlan = current !== null && current.planCode === input.planCode;

  if (samePlan) {
    const start = isRunning ? current.currentPeriodEnd : input.paidAt;
    return {
      start,
      end: addMonthsClamped(start, months),
      previousEndsAt: null,
      extendsCurrent: isRunning,
    };
  }

  return {
    start: input.paidAt,
    end: addMonthsClamped(input.paidAt, months),
    previousEndsAt: isRunning ? input.paidAt : null,
    extendsCurrent: false,
  };
}
