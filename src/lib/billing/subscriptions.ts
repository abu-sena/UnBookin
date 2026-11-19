import 'server-only';
import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { payments, plans, subscriptions } from '@/db/schema';
import { BillingError } from '@/lib/billing/errors';
import {
  resolveSubscriptionPeriod,
  type SubscriptionInterval,
} from '@/lib/billing/subscription-rules';

/**
 * Paid-payment application (M8). Called from the wave-2 webhook inside one
 * transaction. The plan comes from the stored order intent (`payments.ref_id`
 * -> plan row), never from the notification or the browser.
 */
type Database = PostgresJsDatabase<typeof schema>;
export type BillingTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type ApplyPaidPaymentResult = { applied: boolean };
export type MarkPaymentFailedResult = { updated: boolean };

export const FAILED_PAYMENT_STATUSES = ['deny', 'cancel', 'expire', 'failure', 'failed'] as const;
export type FailedPaymentStatus = (typeof FAILED_PAYMENT_STATUSES)[number];

function assertPaymentId(paymentId: string): void {
  if (!z.uuid().safeParse(paymentId).success) throw new BillingError('invalidInput');
}

function assertPaidAt(paidAt: Date): void {
  if (!(paidAt instanceof Date) || Number.isNaN(paidAt.getTime())) {
    throw new BillingError('invalidInput');
  }
}

function readInterval(value: string): SubscriptionInterval {
  if (value === 'month' || value === 'year') return value;
  throw new BillingError('configurationMissing');
}

/**
 * Mark a payment paid and create or extend the subscription period in ONE
 * transaction. Locks the payment row first, so concurrent notifications for the
 * same order can only apply once. An already-paid payment is left untouched.
 */
export async function applyPaidPayment(
  tx: BillingTransaction,
  paymentId: string,
  paidAt: Date,
): Promise<ApplyPaidPaymentResult> {
  assertPaymentId(paymentId);
  assertPaidAt(paidAt);

  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId))
    .for('update')
    .limit(1);

  if (!payment) throw new BillingError('paymentNotFound');
  if (payment.paidAt !== null || payment.midtransStatus === 'paid') return { applied: false };
  if (payment.kind !== 'subscription') throw new BillingError('invalidInput');
  if (!payment.refId) throw new BillingError('paymentNotFound');

  // Serialize all activations for one user, so two different paid orders cannot
  // both read the same "no running period" state and create duplicate rows.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`billing:${payment.userId}`}, 0))`,
  );

  const [plan] = await tx
    .select({
      id: plans.id,
      code: plans.code,
      interval: plans.interval,
    })
    .from(plans)
    .where(eq(plans.id, payment.refId))
    .limit(1);

  // `isActive` is checked when the order is created, not here: once the user has paid, a plan
  // retired in the meantime must still be delivered.
  if (!plan || plan.code === 'free') {
    throw new BillingError('planUnavailable');
  }

  const [current] = await tx
    .select({
      id: subscriptions.id,
      planCode: subscriptions.planCode,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, payment.userId),
        eq(subscriptions.status, 'active'),
        lte(subscriptions.currentPeriodStart, paidAt),
        gt(subscriptions.currentPeriodEnd, paidAt),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .for('update')
    .limit(1);

  const period = resolveSubscriptionPeriod({
    current: current
      ? {
          planCode: current.planCode,
          currentPeriodStart: current.currentPeriodStart,
          currentPeriodEnd: current.currentPeriodEnd,
        }
      : null,
    planCode: plan.code,
    interval: readInterval(plan.interval),
    paidAt,
  });

  if (period.extendsCurrent && current) {
    await tx
      .update(subscriptions)
      .set({ currentPeriodEnd: period.end })
      .where(eq(subscriptions.id, current.id));
  } else {
    if (current && period.previousEndsAt) {
      await tx
        .update(subscriptions)
        .set({ currentPeriodEnd: period.previousEndsAt, status: 'canceled' })
        .where(eq(subscriptions.id, current.id));
    }
    await tx.insert(subscriptions).values({
      userId: payment.userId,
      planCode: plan.code,
      status: 'active',
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
    });
  }

  await tx
    .update(payments)
    .set({ midtransStatus: 'paid', paidAt })
    .where(eq(payments.id, payment.id));

  return { applied: true };
}

/**
 * Mark deny/cancel/expire/failure on a payment that is not paid yet. Never
 * downgrades an already-paid payment.
 */
export async function markPaymentFailed(
  tx: BillingTransaction,
  paymentId: string,
  status: FailedPaymentStatus,
): Promise<MarkPaymentFailedResult> {
  assertPaymentId(paymentId);
  if (!(FAILED_PAYMENT_STATUSES as readonly string[]).includes(status)) {
    throw new BillingError('invalidInput');
  }

  const [payment] = await tx
    .select({
      id: payments.id,
      paidAt: payments.paidAt,
      midtransStatus: payments.midtransStatus,
    })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .for('update')
    .limit(1);

  if (!payment) throw new BillingError('paymentNotFound');
  if (payment.paidAt !== null || payment.midtransStatus === 'paid') {
    return { updated: false };
  }

  await tx.update(payments).set({ midtransStatus: status }).where(eq(payments.id, payment.id));
  return { updated: true };
}
