import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import type { Plan } from '@/db/schema';
import { resolveActivePlan } from '@/lib/billing/active-plan';
import { BillingError } from '@/lib/billing/errors';
import { getMentorAllowance, nextLocalMonthStart } from '@/lib/billing/mentor-quota';
import { getSourceAllowance, getUnbookCapacity, resolveTimeZone } from '@/lib/billing/source-quota';

/**
 * E11-03: one server-side gate for every paid action. Counting stays in the
 * existing source/mentor allowance modules; this only turns them into a single
 * result shape the UI can act on.
 */
export type QuotaKind = 'unbook' | 'mentor_message' | 'original';
export type QuotaDenyReason = 'quotaExceeded' | 'planRequired';

export type QuotaAllowed = {
  allowed: true;
  kind: QuotaKind;
  plan: Plan['code'];
  remaining: number | null;
  limit: number | null;
  resetsAt: Date | null;
};

export type QuotaDenied = {
  allowed: false;
  kind: QuotaKind;
  plan: Plan['code'];
  reason: QuotaDenyReason;
  resetsAt: Date | null;
};

export type QuotaResult = QuotaAllowed | QuotaDenied;

export type QuotaDatabase = Pick<typeof db, 'select' | 'insert' | 'update'>;

const QUOTA_KINDS = new Set<QuotaKind>(['unbook', 'mentor_message', 'original']);

async function profileTimeZone(database: QuotaDatabase, userId: string): Promise<string> {
  const [row] = await database
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return resolveTimeZone(row?.timezone);
}

export async function assertQuota(
  userId: string,
  kind: QuotaKind,
  now: Date = new Date(),
  options: { database?: QuotaDatabase } = {},
): Promise<QuotaResult> {
  if (!z.uuid().safeParse(userId).success) throw new BillingError('invalidInput');
  if (Number.isNaN(now.getTime())) throw new BillingError('invalidInput');
  if (!QUOTA_KINDS.has(kind)) throw new BillingError('invalidInput');

  const database = options.database ?? db;

  try {
    const active = await resolveActivePlan(userId, now, database);
    if (!active) throw new BillingError('configurationMissing');

    if (kind === 'original') {
      if (active.code === 'free') {
        return {
          allowed: false,
          kind,
          plan: active.code,
          reason: 'planRequired',
          resetsAt: null,
        };
      }
      return {
        allowed: true,
        kind,
        plan: active.code,
        remaining: null,
        limit: null,
        resetsAt: active.currentPeriodEnd,
      };
    }

    if (kind === 'unbook') {
      const allowance = await getSourceAllowance(userId, now, { database });
      const resetsAt = nextLocalMonthStart(now, await profileTimeZone(database, userId));
      if (allowance.remaining <= 0) {
        return {
          allowed: false,
          kind,
          plan: active.code,
          reason: 'quotaExceeded',
          resetsAt,
        };
      }
      return {
        allowed: true,
        kind,
        plan: active.code,
        remaining: allowance.remaining,
        limit: getUnbookCapacity(allowance.limits),
        resetsAt,
      };
    }

    const allowance = await getMentorAllowance(userId, now, { database });
    if (allowance.limit !== null && allowance.remaining !== null && allowance.remaining <= 0) {
      return {
        allowed: false,
        kind,
        plan: active.code,
        reason: 'quotaExceeded',
        resetsAt: allowance.resetsAt,
      };
    }
    return {
      allowed: true,
      kind,
      plan: active.code,
      remaining: allowance.remaining,
      limit: allowance.limit,
      resetsAt: allowance.resetsAt,
    };
  } catch (error) {
    if (error instanceof BillingError) throw error;
    throw new BillingError('configurationMissing');
  }
}
