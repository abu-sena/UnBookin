import 'server-only';
import { and, count, desc, eq, gt, inArray, lte, ne, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { plans, profiles, subscriptions, unbooks, usageCounters } from '@/db/schema';
import type { Plan } from '@/db/schema';
import { PlanLimits } from '@/lib/billing/plan-limits';
import { SourceError } from '@/lib/sources/errors';

export const DEFAULT_PROFILE_TIME_ZONE = 'Asia/Jakarta';
export const PENDING_UNBOOK_STATUSES = ['queued', 'outlining', 'generating'] as const;

/** Only the query surface is needed, which keeps quota tests dependency-free. */
export type SourceQuotaDatabase = Pick<typeof db, 'select'>;

export type SourceAllowance = {
  planCode: Plan['code'];
  limits: PlanLimits;
  /** Local calendar month in the user's timezone, `YYYY-MM`. */
  period: string;
  unbooksUsed: number;
  unbooksPending: number;
  remaining: number;
};

export type GetSourceAllowanceOptions = {
  database?: SourceQuotaDatabase;
  /**
   * Internal retry support: ignore this Unbook while counting pending work, so a
   * failed job that is requeued does not look like an extra pending Unbook.
   */
  excludeUnbookId?: string;
};

/** IANA validation; any invalid/missing profile value falls back to Asia/Jakarta. */
export function resolveTimeZone(value: string | null | undefined): string {
  const candidate = value?.trim();
  if (!candidate) return DEFAULT_PROFILE_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return DEFAULT_PROFILE_TIME_ZONE;
  }
}

/** Calendar month in the user's local zone (quota periods are per local month). */
export function getLocalMonthPeriod(now: Date, timeZone: string): string {
  if (Number.isNaN(now.getTime())) throw new SourceError('invalidInput');
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (!year || !month) throw new SourceError('invalidInput');
    return `${year}-${month}`;
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError('invalidInput');
  }
}

/** `null` monthly quota means the plan is fair-use up to `unbooksFairUse`. */
export function getUnbookCapacity(limits: PlanLimits): number {
  return limits.unbooksPerMonth ?? limits.unbooksFairUse;
}

export function getRemainingUnbooks(
  limits: PlanLimits,
  unbooksUsed: number,
  unbooksPending: number,
): number {
  const used = Number.isFinite(unbooksUsed) ? Math.max(0, unbooksUsed) : 0;
  const pending = Number.isFinite(unbooksPending) ? Math.max(0, unbooksPending) : 0;
  return Math.max(0, getUnbookCapacity(limits) - used - pending);
}

/** EPUB/URL pages are estimated from words; PDFs use their real page count. */
export function estimatePageCountFromWords(wordCount: number): number {
  if (!Number.isSafeInteger(wordCount) || wordCount < 0) {
    throw new SourceError('invalidInput');
  }
  return Math.ceil(wordCount / 300);
}

/** Inclusive limit: a file exactly at `maxFileMb` is allowed. */
export function validateSourceFileSize(limits: PlanLimits, sizeBytes: number): void {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new SourceError('invalidInput');
  }
  if (sizeBytes > limits.maxFileMb * 1024 * 1024) {
    throw new SourceError('fileTooLarge');
  }
}

/** Inclusive limit: a source exactly at `maxPagesPerSource` is allowed. */
export function validateSourcePageCount(limits: PlanLimits, pageCount: number): void {
  if (!Number.isSafeInteger(pageCount) || pageCount < 0) {
    throw new SourceError('invalidInput');
  }
  if (pageCount > limits.maxPagesPerSource) {
    throw new SourceError('pagesExceeded');
  }
}

async function loadActivePlan(
  database: SourceQuotaDatabase,
  code: Plan['code'],
): Promise<{ code: Plan['code']; limits: unknown } | null> {
  const [row] = await database
    .select({ code: plans.code, limits: plans.limits })
    .from(plans)
    .where(and(eq(plans.code, code), eq(plans.isActive, true)))
    .limit(1);
  return row ?? null;
}

/**
 * Read-only source allowance. Quota is never written here: the Unbook is
 * charged only when it is ready, not on upload or ingest.
 */
export async function getSourceAllowance(
  userId: string,
  now: Date = new Date(),
  options: GetSourceAllowanceOptions = {},
): Promise<SourceAllowance> {
  if (!z.uuid().safeParse(userId).success) throw new SourceError('invalidInput');
  if (Number.isNaN(now.getTime())) throw new SourceError('invalidInput');
  if (
    options.excludeUnbookId !== undefined &&
    !z.uuid().safeParse(options.excludeUnbookId).success
  ) {
    throw new SourceError('invalidInput');
  }

  const database = options.database ?? db;

  const [profileRow] = await database
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const timeZone = resolveTimeZone(profileRow?.timezone);
  const period = getLocalMonthPeriod(now, timeZone);

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
  if (!planRow) throw new SourceError('configurationMissing');

  const parsedLimits = PlanLimits.safeParse(planRow.limits);
  if (!parsedLimits.success) throw new SourceError('configurationMissing');
  const limits = parsedLimits.data;

  const [usageRow] = await database
    .select({ unbooksUsed: usageCounters.unbooksUsed })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.period, period)))
    .limit(1);

  const pendingConditions: SQL<unknown>[] = [
    eq(unbooks.userId, userId),
    inArray(unbooks.status, [...PENDING_UNBOOK_STATUSES]),
  ];
  if (options.excludeUnbookId) {
    pendingConditions.push(ne(unbooks.id, options.excludeUnbookId));
  }

  const [pendingRow] = await database
    .select({ value: count() })
    .from(unbooks)
    .where(and(...pendingConditions));

  const unbooksUsed = Math.max(0, usageRow?.unbooksUsed ?? 0);
  const unbooksPending = Math.max(0, Number(pendingRow?.value ?? 0));

  return {
    planCode: planRow.code,
    limits,
    period,
    unbooksUsed,
    unbooksPending,
    remaining: getRemainingUnbooks(limits, unbooksUsed, unbooksPending),
  };
}
