import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import type { PlanLimits } from '@/lib/billing/plan-limits';
import { processMidtransNotification } from '@/lib/billing/notifications';

/**
 * REAL-DB webhook integration. SKIPPED unless BILLING_DB_URL is set.
 * Safety: local host only, the database name must include "test", and every
 * fixture uses fresh UUIDs and is removed afterwards. The server key is a
 * throwaway test value, never read from `.env.local`.
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

const SERVER_KEY = 'SB-Mid-server-real-db-webhook-test';

const proLimits: PlanLimits = {
  unbooksPerMonth: 8,
  unbooksFairUse: 8,
  maxPagesPerSource: 500,
  maxFileMb: 100,
  mentorMessagesPerMonth: 300,
  originalsAccess: 'full',
  modelTier: 'main',
};

function sign(orderId: string, statusCode: string, grossAmount: string): string {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`)
    .digest('hex');
}

function notification(
  orderId: string,
  grossAmount: number,
  transactionStatus: string,
): Record<string, unknown> {
  const statusCode = '200';
  const amount = `${grossAmount}.00`;
  const base: Record<string, unknown> = {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: amount,
    transaction_status: transactionStatus,
    payment_type: 'bank_transfer',
    transaction_time: '2026-11-19 15:00:00',
    signature_key: sign(orderId, statusCode, amount),
  };
  if (transactionStatus === 'settlement') base.settlement_time = '2026-11-19 15:00:00';
  return base;
}

describe.skipIf(!URL_VALUE)('Midtrans webhook real-DB integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let userId = '';
  let createdPlan = false;
  let planId = '';
  let planPrice = 0;

  beforeAll(async () => {
    assertLocalTestDatabase(URL_VALUE);
    const inherited = process.env.DATABASE_URL;
    if (inherited && inherited !== URL_VALUE) {
      throw new Error('DATABASE_URL must be unset or equal to BILLING_DB_URL for this test.');
    }
    process.env.DATABASE_URL = URL_VALUE;
    process.env.MIDTRANS_SERVER_KEY = SERVER_KEY;
    process.env.MIDTRANS_IS_PRODUCTION = 'false';

    client = postgres(URL_VALUE, { prepare: false, max: 10 });
    db = drizzle(client, { schema, casing: 'snake_case' });

    const [existing] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.code, 'pro_monthly'));
    if (existing) {
      planId = existing.id;
      planPrice = existing.priceIdr;
    } else {
      const [created] = await db
        .insert(schema.plans)
        .values({
          code: 'pro_monthly',
          name: 'Pro Bulanan',
          priceIdr: 59000,
          interval: 'month',
          limits: proLimits,
        })
        .returning();
      if (!created) throw new Error('Failed to create the test plan.');
      planId = created.id;
      planPrice = created.priceIdr;
      createdPlan = true;
    }

    userId = randomUUID();
    await db.insert(schema.users).values({
      id: userId,
      name: 'M8 Webhook Real DB',
      email: `m8-webhook-${randomUUID()}@example.test`,
    });
  });

  afterAll(async () => {
    if (db && userId) {
      await db.delete(schema.payments).where(eq(schema.payments.userId, userId));
      await db.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, userId));
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
    if (db && createdPlan) {
      await db.delete(schema.plans).where(eq(schema.plans.code, 'pro_monthly'));
    }
    await client?.end({ timeout: 5 });
  });

  it('applies one activation for five concurrent settlements and survives expire', async () => {
    const orderId = `UB-${randomUUID().slice(0, 8)}-${randomUUID().slice(0, 12)}`;
    const [payment] = await db
      .insert(schema.payments)
      .values({
        userId,
        kind: 'subscription',
        refId: planId,
        amountIdr: planPrice,
        midtransOrderId: orderId,
        midtransStatus: 'pending',
      })
      .returning();
    if (!payment) throw new Error('Failed to create the test payment.');

    const settlement = notification(orderId, planPrice, 'settlement');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => processMidtransNotification(settlement)),
    );
    expect(results).toEqual(Array.from({ length: 5 }, () => ({ status: 200 })));

    const [paid] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, payment.id));
    expect(paid?.midtransStatus).toBe('paid');
    expect(paid?.paidAt?.toISOString()).toBe('2026-11-19T08:00:00.000Z');
    expect(paid?.raw?.signature_key).toBeUndefined();

    const periods = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId));
    expect(periods).toHaveLength(1);
    expect(periods[0]?.planCode).toBe('pro_monthly');
    expect(periods[0]?.status).toBe('active');

    const expire = notification(orderId, planPrice, 'expire');
    await expect(processMidtransNotification(expire)).resolves.toEqual({ status: 200 });

    const [stillPaid] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, payment.id));
    expect(stillPaid?.midtransStatus).toBe('paid');
    expect(stillPaid?.paidAt?.toISOString()).toBe('2026-11-19T08:00:00.000Z');

    const afterExpire = await db
      .select()
      .from(schema.subscriptions)
      .where(inArray(schema.subscriptions.userId, [userId]));
    expect(afterExpire).toHaveLength(1);
  });
});