import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, count, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { payments, plans, users } from '@/db/schema';
import type { NewPayment, Plan } from '@/db/schema';
import { BillingError } from '@/lib/billing/errors';
import { buildFinishUrl, createSnapTransaction } from '@/lib/billing/midtrans';

/**
 * Subscription checkout (E11-02). The amount always comes from `plans.price_idr`;
 * the client only chooses a plan code. The order intent is stored in
 * `payments.ref_id` (the plan row id), so activation never trusts client input.
 */
export const MAX_PENDING_ORDERS = 3;
export const PENDING_ORDER_WINDOW_MS = 10 * 60 * 1000;
const MAX_ORDER_ID_LENGTH = 50;

export type CheckoutDatabase = Pick<typeof db, 'select' | 'insert' | 'update'>;

export type CreateSubscriptionOrderOptions = {
  database?: CheckoutDatabase;
  now?: Date;
};

export type SubscriptionOrder = {
  orderId: string;
  token: string;
  redirectUrl: string;
};

/** Unique, readable order id: `UB-<base36 time>-<random hex>` (well under 50 chars). */
export function generateOrderId(
  nowMs: number = Date.now(),
  random: Buffer = randomBytes(6),
): string {
  const orderId = `UB-${Math.trunc(nowMs).toString(36)}-${random.toString('hex')}`;
  if (orderId.length > MAX_ORDER_ID_LENGTH) throw new BillingError('invalidInput');
  return orderId;
}

/** Build the payment row from the stored plan row only; no caller-supplied amount. */
export function buildSubscriptionPaymentValues(
  plan: Pick<Plan, 'id' | 'code' | 'priceIdr'>,
  userId: string,
  orderId: string,
): NewPayment {
  if (plan.code === 'free' || plan.priceIdr <= 0) {
    throw new BillingError('freePlanNotPurchasable');
  }
  return {
    userId,
    kind: 'subscription',
    refId: plan.id,
    amountIdr: plan.priceIdr,
    midtransOrderId: orderId,
    midtransStatus: 'pending',
  };
}

function firstCustomerName(name: string | null, email: string | null): string {
  const firstName = name?.trim().split(/\s+/).filter(Boolean)[0];
  if (firstName) return firstName;
  const localPart = email?.split('@')[0]?.trim();
  return localPart || 'Unbookin';
}

export async function createSubscriptionOrder(
  userId: string,
  planCode: Plan['code'],
  options: CreateSubscriptionOrderOptions = {},
): Promise<SubscriptionOrder> {
  if (!z.uuid().safeParse(userId).success) throw new BillingError('invalidInput');
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new BillingError('invalidInput');
  const database = options.database ?? db;

  const [plan] = await database
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      priceIdr: plans.priceIdr,
      interval: plans.interval,
      isActive: plans.isActive,
    })
    .from(plans)
    .where(and(eq(plans.code, planCode), eq(plans.isActive, true)))
    .limit(1);

  if (!plan) throw new BillingError('planUnavailable');
  if (plan.code === 'free' || plan.priceIdr <= 0) {
    throw new BillingError('freePlanNotPurchasable');
  }
  if (plan.interval !== 'month' && plan.interval !== 'year') {
    throw new BillingError('configurationMissing');
  }

  const windowStart = new Date(now.getTime() - PENDING_ORDER_WINDOW_MS);
  const [pending] = await database
    .select({ value: count() })
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.kind, 'subscription'),
        eq(payments.midtransStatus, 'pending'),
        gt(payments.createdAt, windowStart),
      ),
    );
  if (Number(pending?.value ?? 0) >= MAX_PENDING_ORDERS) {
    throw new BillingError('orderLimitReached');
  }

  const [user] = await database
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new BillingError('invalidInput');

  const orderId = generateOrderId(now.getTime());
  const values = buildSubscriptionPaymentValues(plan, userId, orderId);
  await database.insert(payments).values(values).returning({ id: payments.id });

  try {
    const snap = await createSnapTransaction({
      orderId,
      grossAmount: plan.priceIdr,
      planName: plan.name,
      planCode: plan.code,
      customer: {
        firstName: firstCustomerName(user.name, user.email),
        email: user.email ?? '',
      },
      finishUrl: buildFinishUrl(orderId, process.env.NEXT_PUBLIC_APP_URL),
    });
    return { orderId, token: snap.token, redirectUrl: snap.redirectUrl };
  } catch (error) {
    try {
      await database
        .update(payments)
        .set({ midtransStatus: 'failed' })
        .where(eq(payments.midtransOrderId, orderId));
    } catch {
      // Keep the original safe error; the stored intent can be reconciled later.
    }
    throw error instanceof BillingError ? error : new BillingError('midtransFailed');
  }
}
