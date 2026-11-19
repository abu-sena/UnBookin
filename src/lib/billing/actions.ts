'use server';

import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { payments, plans } from '@/db/schema';
import { requireUser } from '@/lib/auth/session';
import { resolveActivePlan } from '@/lib/billing/active-plan';
import { createSubscriptionOrder, type SubscriptionOrder } from '@/lib/billing/checkout';
import {
  BillingError,
  toBillingErrorCode,
  type BillingErrorCode,
} from '@/lib/billing/errors';
import { syncOrderStatus, type OrderStatusView } from '@/lib/billing/order-status';
import { getDisplayedPlans, type DisplayedPlan, type PlanCode } from '@/lib/billing/pricing';
import {
  daysUntil,
  isRenewSoon,
  toPaymentStatus,
  type PaymentStatus,
} from '@/components/billing/format';
import {
  getSnapClientConfig,
  type SnapClientConfig,
} from '@/components/billing/server-config';

/**
 * Server Actions for E11. `requireUser` always runs first (outside any try/catch)
 * and identity comes from the session only. Inputs are strict Zod objects and
 * failures cross the boundary as safe billing codes, never vendor detail.
 */

const planCodeSchema = z.enum([
  'free',
  'pro_monthly',
  'pro_yearly',
  'byok_monthly',
  'byok_yearly',
]);

const orderIdSchema = z.strictObject({
  orderId: z.string().trim().min(1).max(50),
});

const checkoutSchema = z.strictObject({ planCode: planCodeSchema });

export type BillingActionFailure = { ok: false; error: BillingErrorCode };
export type StartCheckoutResult =
  | { ok: true; data: SubscriptionOrder }
  | BillingActionFailure;
export type GetOrderStatusResult =
  | { ok: true; data: OrderStatusView }
  | BillingActionFailure;

export type SubscriptionPaymentView = {
  id: string;
  date: string;
  planName: string;
  amountIdr: number;
  status: PaymentStatus;
};

export type SubscriptionOverview = {
  planCode: PlanCode;
  planName: string;
  currentPeriodEnd: string | null;
  daysLeft: number | null;
  renewSoon: boolean;
  payments: SubscriptionPaymentView[];
};

export type GetSubscriptionOverviewResult =
  | { ok: true; data: SubscriptionOverview }
  | BillingActionFailure;

export type PaywallConfig = SnapClientConfig & { plans: DisplayedPlan[] };
export type GetPaywallConfigResult =
  | { ok: true; data: PaywallConfig }
  | BillingActionFailure;

export type RenewalInfo = { daysLeft: number | null; renewSoon: boolean };
export type GetRenewalInfoResult = { ok: true; data: RenewalInfo } | BillingActionFailure;

function failure(error: unknown): BillingActionFailure {
  return { ok: false, error: toBillingErrorCode(error) };
}

export async function startCheckout(input: unknown): Promise<StartCheckoutResult> {
  const user = await requireUser('/settings/langganan');
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalidInput' };

  try {
    const order = await createSubscriptionOrder(user.id, parsed.data.planCode);
    return { ok: true, data: order };
  } catch (error) {
    return failure(error);
  }
}

export async function getOrderStatus(input: unknown): Promise<GetOrderStatusResult> {
  const user = await requireUser('/settings/langganan');
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalidInput' };

  try {
    const view = await syncOrderStatus({ userId: user.id }, parsed.data.orderId);
    return { ok: true, data: view };
  } catch (error) {
    return failure(error);
  }
}

export async function getSubscriptionOverview(): Promise<GetSubscriptionOverviewResult> {
  const user = await requireUser('/settings/langganan');

  try {
    const now = new Date();
    const active = await resolveActivePlan(user.id, now);
    if (!active) throw new BillingError('configurationMissing');

    const [planRow] = await db
      .select({ name: plans.name })
      .from(plans)
      .where(eq(plans.code, active.code))
      .limit(1);

    const rows = await db
      .select({
        id: payments.id,
        createdAt: payments.createdAt,
        amountIdr: payments.amountIdr,
        midtransStatus: payments.midtransStatus,
        paidAt: payments.paidAt,
        planName: plans.name,
      })
      .from(payments)
      .leftJoin(plans, eq(plans.id, payments.refId))
      .where(eq(payments.userId, user.id))
      .orderBy(desc(payments.createdAt))
      .limit(10);

    const periodEnd = active.currentPeriodEnd;
    const daysLeft = periodEnd ? daysUntil(periodEnd, now) : null;

    return {
      ok: true,
      data: {
        planCode: active.code,
        planName: planRow?.name ?? active.code,
        currentPeriodEnd: periodEnd ? periodEnd.toISOString() : null,
        daysLeft,
        renewSoon: isRenewSoon(daysLeft),
        payments: rows.map((row) => ({
          id: row.id,
          date: (row.paidAt ?? row.createdAt).toISOString(),
          planName: row.planName ?? '',
          amountIdr: row.amountIdr,
          status: toPaymentStatus(row.midtransStatus),
        })),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function getRenewalInfo(): Promise<GetRenewalInfoResult> {
  const user = await requireUser('/home');

  try {
    const active = await resolveActivePlan(user.id);
    const daysLeft = active?.currentPeriodEnd
      ? daysUntil(active.currentPeriodEnd)
      : null;
    return { ok: true, data: { daysLeft, renewSoon: isRenewSoon(daysLeft) } };
  } catch (error) {
    return failure(error);
  }
}

export async function getPaywallConfig(): Promise<GetPaywallConfigResult> {
  await requireUser('/settings/langganan');

  try {
    const plans = await getDisplayedPlans('A');
    return { ok: true, data: { ...getSnapClientConfig(), plans } };
  } catch (error) {
    return failure(error);
  }
}