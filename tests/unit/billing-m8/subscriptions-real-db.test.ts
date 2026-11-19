import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import type { PlanLimits } from '@/lib/billing/plan-limits';

/**
 * REAL-DB integration for M8 activation. SKIPPED unless BILLING_DB_URL is set.
 * The runner exports DATABASE_URL and BILLING_DB_URL to the same LOCAL test URL.
 * Safety: the host must be 127.0.0.1/localhost and the database name must
 * include "test". Every fixture uses fresh UUIDs and is removed afterwards.
 */
const URL_VALUE = process.env.BILLING_DB_URL ?? '';

function assertLocalTestDatabase(value: string): void {
  const parsed = new URL(value);
  const host = parsed.hostname;
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['127.0.0.1', 'localhost'].includes(host) || !name.includes('test')) {
    throw new Error('BILLING_DB_URL must be a local database whose name includes "test".');
  }
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

const proLimits: PlanLimits = {
  unbooksPerMonth: 8,
  unbooksFairUse: 8,
  maxPagesPerSource: 500,
  maxFileMb: 100,
  mentorMessagesPerMonth: 300,
  originalsAccess: 'full',
  modelTier: 'main',
};

const PAID_AT = new Date('2026-11-19T08:00:00.000Z');

describe.skipIf(!URL_VALUE)('subscriptions real-DB integration (isolated local DB)', () => {
  it('applies once under concurrency, extends, switches and never downgrades', async () => {
    assertLocalTestDatabase(URL_VALUE);
    const inherited = process.env.DATABASE_URL;
    if (inherited && inherited !== URL_VALUE) {
      throw new Error('DATABASE_URL must be unset or equal to BILLING_DB_URL for this test.');
    }
    process.env.DATABASE_URL = URL_VALUE;

    const client = postgres(URL_VALUE, { prepare: false, max: 10 });
    const db: Db = drizzle(client, { schema, casing: 'snake_case' });

    const userIds: string[] = [];
    const createdPlanCodes: Array<'pro_monthly' | 'pro_yearly'> = [];

    async function ensurePlan(
      code: 'pro_monthly' | 'pro_yearly',
      interval: 'month' | 'year',
      priceIdr: number,
    ) {
      const [existing] = await db.select().from(schema.plans).where(eq(schema.plans.code, code));
      if (existing) return existing;
      const [created] = await db
        .insert(schema.plans)
        .values({
          code,
          name: code === 'pro_monthly' ? 'Pro Bulanan' : 'Pro Tahunan',
          priceIdr,
          interval,
          limits: proLimits,
        })
        .returning();
      if (!created) throw new Error('Failed to create the test plan.');
      createdPlanCodes.push(code);
      return created;
    }

    async function createOrder(userId: string, planId: string, amountIdr: number) {
      const [row] = await db
        .insert(schema.payments)
        .values({
          userId,
          kind: 'subscription',
          refId: planId,
          amountIdr,
          midtransOrderId: `UB-${randomUUID().slice(0, 8)}-${randomUUID().slice(0, 12)}`,
          midtransStatus: 'pending',
        })
        .returning();
      if (!row) throw new Error('Failed to create the test payment.');
      return row;
    }

    try {
      const monthly = await ensurePlan('pro_monthly', 'month', 59000);
      const yearly = await ensurePlan('pro_yearly', 'year', 449000);

      const userId = randomUUID();
      userIds.push(userId);
      await db.insert(schema.users).values({
        id: userId,
        name: 'M8 Billing Check',
        email: `m8-billing-${randomUUID()}@example.test`,
      });

      const { applyPaidPayment, markPaymentFailed } = await import('@/lib/billing/subscriptions');

      const apply = (paymentId: string, paidAt: Date) =>
        db.transaction((tx) => applyPaidPayment(tx, paymentId, paidAt));

      const first = await createOrder(userId, monthly.id, monthly.priceIdr);
      const concurrent = await Promise.all(
        Array.from({ length: 5 }, () => apply(first.id, PAID_AT)),
      );
      expect(concurrent.filter((result) => result.applied)).toHaveLength(1);
      expect(concurrent.filter((result) => !result.applied)).toHaveLength(4);

      const [afterFirst] = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId));
      expect(afterFirst).toBeDefined();
      expect(afterFirst?.planCode).toBe('pro_monthly');
      expect(afterFirst?.status).toBe('active');
      expect(afterFirst?.currentPeriodStart.toISOString()).toBe('2026-11-19T08:00:00.000Z');
      expect(afterFirst?.currentPeriodEnd.toISOString()).toBe('2026-12-19T08:00:00.000Z');

      const [paidFirst] = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, first.id));
      expect(paidFirst?.midtransStatus).toBe('paid');
      expect(paidFirst?.paidAt?.toISOString()).toBe('2026-11-19T08:00:00.000Z');

      // A second call on the same payment must not touch anything.
      await expect(apply(first.id, PAID_AT)).resolves.toEqual({ applied: false });
      const paidAgain = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, first.id));
      expect(paidAgain).toHaveLength(1);

      // Same plan renews from the running period end.
      const renewal = await createOrder(userId, monthly.id, monthly.priceIdr);
      await apply(renewal.id, new Date('2026-11-24T08:00:00.000Z'));
      const afterRenew = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId));
      expect(afterRenew).toHaveLength(1);
      expect(afterRenew[0]?.currentPeriodStart.toISOString()).toBe('2026-11-19T08:00:00.000Z');
      expect(afterRenew[0]?.currentPeriodEnd.toISOString()).toBe('2027-01-19T08:00:00.000Z');

      // A different plan starts now and the previous remainder is lost.
      const switchedAt = new Date('2026-11-29T08:00:00.000Z');
      const switchOrder = await createOrder(userId, yearly.id, yearly.priceIdr);
      await apply(switchOrder.id, switchedAt);
      const afterSwitch = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId))
        .orderBy(schema.subscriptions.currentPeriodStart);
      expect(afterSwitch).toHaveLength(2);
      expect(afterSwitch[0]?.planCode).toBe('pro_monthly');
      expect(afterSwitch[0]?.status).toBe('canceled');
      expect(afterSwitch[0]?.currentPeriodEnd.toISOString()).toBe('2026-11-29T08:00:00.000Z');
      expect(afterSwitch[1]?.planCode).toBe('pro_yearly');
      expect(afterSwitch[1]?.status).toBe('active');
      expect(afterSwitch[1]?.currentPeriodStart.toISOString()).toBe('2026-11-29T08:00:00.000Z');
      expect(afterSwitch[1]?.currentPeriodEnd.toISOString()).toBe('2027-11-29T08:00:00.000Z');

      // A failure notification after payment never downgrades it.
      await expect(
        db.transaction((tx) => markPaymentFailed(tx, first.id, 'expire')),
      ).resolves.toEqual({ updated: false });
      const [stillPaid] = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, first.id));
      expect(stillPaid?.midtransStatus).toBe('paid');
      expect(stillPaid?.paidAt?.toISOString()).toBe('2026-11-19T08:00:00.000Z');

      const pending = await createOrder(userId, monthly.id, monthly.priceIdr);
      await expect(
        db.transaction((tx) => markPaymentFailed(tx, pending.id, 'cancel')),
      ).resolves.toEqual({ updated: true });
      const [failed] = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, pending.id));
      expect(failed?.midtransStatus).toBe('cancel');
      expect(failed?.paidAt).toBeNull();
    } finally {
      if (userIds.length > 0) {
        await db.delete(schema.payments).where(inArray(schema.payments.userId, userIds));
        await db.delete(schema.subscriptions).where(inArray(schema.subscriptions.userId, userIds));
        await db.delete(schema.users).where(inArray(schema.users.id, userIds));
      }
      if (createdPlanCodes.length > 0) {
        await db.delete(schema.plans).where(inArray(schema.plans.code, createdPlanCodes));
      }
      await client.end({ timeout: 5 });
    }
  });
});
