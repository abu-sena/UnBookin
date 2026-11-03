import 'server-only';
import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { profiles, subscriptions, usageCounters } from '@/db/schema';
import type { Plan } from '@/db/schema';
import { MentorError } from '@/lib/mentor/errors';
import { PlanLimits } from '@/lib/billing/plan-limits';
import {
  getLocalMonthPeriod,
  loadActivePlan,
  resolveTimeZone,
} from '@/lib/billing/source-quota';

/**
 * Mentor message quota. Rules are pure where possible so they can be tested
 * without a database; every write is a single conditional statement so two
 * concurrent requests can never spend the same last message.
 */

/** PRD §11: at most 30 mentor messages per user per minute. */
export const MENTOR_RATE_LIMIT = { maxMessages: 30, windowMs: 60_000 } as const;

export type MentorQuotaDatabase = Pick<typeof db, 'select' | 'insert' | 'update'>;

export type MentorAllowance = {
  /** `null` means unlimited (BYOK). */
  limit: number | null;
  used: number;
  remaining: number | null;
  /** Local calendar month in the profile's time zone, `YYYY-MM`. */
  period: string;
  /** First instant of the next local month in the profile's time zone. */
  resetsAt: Date;
};

export type MentorReservation = { period: string };

export type MentorReserveResult = {
  reservation: MentorReservation;
  allowance: MentorAllowance;
};

function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return asUtc - utcMs;
}

/**
 * Convert a local wall-clock midnight to the matching instant. The offset is
 * re-read at the adjusted instant so DST transitions are handled.
 */
function localMidnightToInstant(year: number, monthIndex: number, timeZone: string): Date {
  const target = Date.UTC(year, monthIndex, 1, 0, 0, 0, 0);
  let instant = target - timeZoneOffsetMs(target, timeZone);
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = timeZoneOffsetMs(instant, timeZone);
    const next = target - offset;
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant);
}

/** First instant of the local month after `now` (DST-safe). */
export function nextLocalMonthStart(now: Date, timeZone: string): Date {
  const period = getLocalMonthPeriod(now, timeZone);
  const [year, month] = period.split('-').map(Number) as [number, number];
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthIndex = month === 12 ? 0 : month;
  return localMidnightToInstant(nextYear, nextMonthIndex, timeZone);
}

/** Pure allowance math shared by reads and reservations. */
export function computeMentorAllowance(input: {
  limit: number | null;
  used: number;
  now: Date;
  timeZone: string;
}): MentorAllowance {
  const used = Number.isFinite(input.used) ? Math.max(0, Math.trunc(input.used)) : 0;
  const limit = input.limit === null ? null : Math.max(0, Math.trunc(input.limit));
  return {
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    period: getLocalMonthPeriod(input.now, input.timeZone),
    resetsAt: nextLocalMonthStart(input.now, input.timeZone),
  };
}

/** Refunds never go below zero, even if the counter was already empty. */
export function usageAfterRefund(used: number): number {
  return Number.isFinite(used) ? Math.max(0, Math.trunc(used) - 1) : 0;
}

async function resolveMentorPlan(
  database: MentorQuotaDatabase,
  userId: string,
  now: Date,
): Promise<{ limits: PlanLimits; timeZone: string }> {
  const [profileRow] = await database
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  const timeZone = resolveTimeZone(profileRow?.timezone);

  const [subscriptionRow] = await database
    .select({ planCode: subscriptions.planCode })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, 'active'),
        lte(subscriptions.currentPeriodStart, now),
        gt(subscriptions.currentPeriodEnd, now),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  const requestedCode: Plan['code'] = subscriptionRow?.planCode ?? 'free';
  let planRow = await loadActivePlan(database, requestedCode);
  if (!planRow && requestedCode !== 'free') {
    planRow = await loadActivePlan(database, 'free');
  }
  if (!planRow) throw new MentorError('failed');
  const parsed = PlanLimits.safeParse(planRow.limits);
  if (!parsed.success) throw new MentorError('failed');
  return { limits: parsed.data, timeZone };
}

function assertUserId(userId: string): void {
  if (!z.uuid().safeParse(userId).success) throw new MentorError('invalidInput');
}

function assertNow(now: Date): void {
  if (Number.isNaN(now.getTime())) throw new MentorError('invalidInput');
}

/** Read-only mentor allowance for the profile's current local month. */
export async function getMentorAllowance(
  userId: string,
  now: Date = new Date(),
  options: { database?: MentorQuotaDatabase } = {},
): Promise<MentorAllowance> {
  assertUserId(userId);
  assertNow(now);
  const database = options.database ?? db;
  const { limits, timeZone } = await resolveMentorPlan(database, userId, now);
  const period = getLocalMonthPeriod(now, timeZone);

  const [usageRow] = await database
    .select({ used: usageCounters.mentorMessagesUsed })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.period, period)))
    .limit(1);

  return computeMentorAllowance({
    limit: limits.mentorMessagesPerMonth,
    used: usageRow?.used ?? 0,
    now,
    timeZone,
  });
}

/**
 * Reserve one message BEFORE the AI call.
 *
 * The conditional upsert is the whole reservation: Postgres serializes the
 * conflicting rows, so a `used < limit` condition can never be satisfied by
 * two concurrent requests. A `null` limit (BYOK) never blocks but still counts
 * usage. The caller must not refund after the answer has started.
 */
export async function reserveMentorMessage(
  userId: string,
  now: Date = new Date(),
  options: { database?: MentorQuotaDatabase } = {},
): Promise<MentorReserveResult> {
  assertUserId(userId);
  assertNow(now);
  const database = options.database ?? db;
  const { limits, timeZone } = await resolveMentorPlan(database, userId, now);
  const limit = limits.mentorMessagesPerMonth;
  const period = getLocalMonthPeriod(now, timeZone);

  if (limit !== null && limit <= 0) throw new MentorError('quotaExceeded');

  const rows = await database
    .insert(usageCounters)
    .values({ userId, period, mentorMessagesUsed: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.period],
      set: { mentorMessagesUsed: sql`${usageCounters.mentorMessagesUsed} + 1` },
      ...(limit === null
        ? {}
        : { setWhere: sql`${usageCounters.mentorMessagesUsed} < ${limit}` }),
    })
    .returning({ used: usageCounters.mentorMessagesUsed });

  const [row] = rows;
  if (!row) throw new MentorError('quotaExceeded');

  return {
    reservation: { period },
    allowance: computeMentorAllowance({ limit, used: row.used, now, timeZone }),
  };
}

/**
 * Refund the SAME period the reservation charged, never below zero. The month
 * may have rolled over in between; the original period still gets the refund.
 * Idempotency is the caller's duty: calling this twice refunds twice.
 */
export async function refundMentorMessage(
  userId: string,
  reservation: MentorReservation,
  options: { database?: MentorQuotaDatabase } = {},
): Promise<{ period: string; used: number }> {
  assertUserId(userId);
  if (!z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).safeParse(reservation?.period).success) {
    throw new MentorError('invalidInput');
  }
  const database = options.database ?? db;

  const rows = await database
    .update(usageCounters)
    .set({ mentorMessagesUsed: sql`greatest(${usageCounters.mentorMessagesUsed} - 1, 0)` })
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.period, reservation.period),
      ),
    )
    .returning({ used: usageCounters.mentorMessagesUsed });

  return { period: reservation.period, used: rows[0]?.used ?? 0 };
}

