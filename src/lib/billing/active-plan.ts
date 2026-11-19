import 'server-only';
import { and, desc, eq, gt, lte } from 'drizzle-orm';
import { db } from '@/db';
import { subscriptions } from '@/db/schema';
import type { Plan } from '@/db/schema';
import { PlanLimits } from '@/lib/billing/plan-limits';
import { loadActivePlan } from '@/lib/billing/source-quota';

export type ActivePlanDatabase = Pick<typeof db, 'select'>;

export type ActivePlan = {
  /** The plan whose limits apply now; `free` when no paid period is running. */
  code: Plan['code'];
  limits: PlanLimits;
  /** True for the BYOK plans, whose AI calls must use the user's own key. */
  byok: boolean;
  /** End of the running paid period, or `null` on the free plan. */
  currentPeriodEnd: Date | null;
};

export function isByokPlan(code: Plan['code']): boolean {
  return code === 'byok_monthly' || code === 'byok_yearly';
}

/**
 * Single source of truth for "which plan applies to this user right now" (M8). A subscription
 * counts only while `status = 'active'` and `now` is inside its period; otherwise the user is on
 * `free`. Callers that already have their own copy of this lookup should move to this function.
 */
export async function resolveActivePlan(
  userId: string,
  now: Date = new Date(),
  database: ActivePlanDatabase = db,
): Promise<ActivePlan | null> {
  const [subscription] = await database
    .select({ planCode: subscriptions.planCode, currentPeriodEnd: subscriptions.currentPeriodEnd })
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

  const requested: Plan['code'] = subscription?.planCode ?? 'free';
  let plan = await loadActivePlan(database, requested);
  let paid = Boolean(subscription && plan);
  if (!plan && requested !== 'free') {
    plan = await loadActivePlan(database, 'free');
    paid = false;
  }
  if (!plan) return null;

  const limits = PlanLimits.safeParse(plan.limits);
  if (!limits.success) return null;
  return {
    code: plan.code,
    limits: limits.data,
    byok: isByokPlan(plan.code),
    currentPeriodEnd: paid && subscription ? subscription.currentPeriodEnd : null,
  };
}
