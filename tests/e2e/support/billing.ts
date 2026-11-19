import { createHash } from 'node:crypto';

import { E2E_BASE_URL, E2E_PROVIDER_ORIGIN } from './config';
import type { Db } from './db';

/**
 * M8 e2e fixtures: fake Midtrans + OpenRouter OAuth values, learner plan/order
 * helpers, and signed webhook delivery. Every write is scoped to the fixture
 * learner; the fake provider stays loopback only. No request body is logged and
 * no real Midtrans/OpenRouter host is ever called.
 */

/** Fixture-only values. Never real secrets and never a production key. */
export const E2E_MIDTRANS_SERVER_KEY = 'm8-e2e-midtrans-server-key';
export const E2E_MIDTRANS_CLIENT_KEY = 'm8-e2e-midtrans-client-key';
export const E2E_MIDTRANS_SNAP_URL = `${E2E_PROVIDER_ORIGIN}/midtrans/snap/v1/transactions`;
export const E2E_MIDTRANS_API_URL = `${E2E_PROVIDER_ORIGIN}/midtrans/api`;
export const E2E_OPENROUTER_AUTH_URL = `${E2E_PROVIDER_ORIGIN}/openrouter-auth`;
/** Base64 of 32 bytes (42 repeated), a throwaway local-only master key. */
export const E2E_BYOK_ENCRYPTION_KEY = 'KioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKio=';
export const E2E_FIXTURE_BYOK_KEY = 'sk-or-v1-e2e000000000000000000000000abcd';
export const E2E_INVALID_BYOK_KEY = 'sk-or-v1-invalid-manual-key-0000000000';
export const E2E_BYOK_LAST4 = E2E_FIXTURE_BYOK_KEY.slice(-4);

export type ProviderAuthCounters = {
  byokChats: number;
  platformChats: number;
  keyChecks: number;
};

export type PlanRow = {
  code: string;
  name: string;
  price_idr: number;
  interval: string;
  limits: { mentorMessagesPerMonth: number | null } & Record<string, unknown>;
};

export type PaymentRow = {
  order_id: string;
  status: string;
  amount_idr: number;
  paid_at: Date | null;
};

export type SubscriptionRow = {
  plan_code: string;
  status: string;
  period_start: Date;
  period_end: Date;
};

export type ByokRow = {
  last4: string;
  connected_via: string;
  encrypted_key: string;
  iv: string;
  auth_tag: string;
  key_version: number;
  verified_at: Date | null;
};

export type AiCallRow = { task: string; model: string; byok: boolean; status: string };

/** `59000` -> `"59000.00"`, the decimal form Midtrans actually sends. */
export function midtransGross(amount: number): string {
  return `${amount}.00`;
}

/** sha512(order_id + status_code + gross_amount + server_key), hex encoded. */
export function midtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string = E2E_MIDTRANS_SERVER_KEY,
): string {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

/** Switch the loopback provider mode (Midtrans status or mentor streaming). */
export async function setProviderMode(mode: string): Promise<void> {
  const response = await fetch(`${E2E_PROVIDER_ORIGIN}/mode`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
  if (response.status !== 200) throw new Error(`provider mode failed: ${response.status}`);
}

/** Auth counters only; the provider never stores or echoes a token. */
export async function readProviderAuth(): Promise<ProviderAuthCounters> {
  const response = await fetch(`${E2E_PROVIDER_ORIGIN}/debug/auth`);
  if (response.status !== 200) throw new Error(`provider debug failed: ${response.status}`);
  return (await response.json()) as ProviderAuthCounters;
}

/** Reset only the fixture learner's billing rows. */
export async function resetBilling(db: Db, userId: string): Promise<void> {
  await db`delete from byok_keys where user_id = ${userId}`;
  await db`delete from payments where user_id = ${userId}`;
  await db`delete from subscriptions where user_id = ${userId}`;
}

/** Put the learner on exactly one active plan period ending at `periodEnd`. */
export async function setLearnerPlan(
  db: Db,
  userId: string,
  planCode: string,
  periodEnd: Date,
  periodStart: Date = new Date(Date.now() - 60 * 60 * 1000),
): Promise<void> {
  await db`delete from subscriptions where user_id = ${userId}`;
  await db`
    insert into subscriptions (user_id, plan_code, status, current_period_start, current_period_end)
    values (${userId}, ${planCode}, 'active', ${periodStart}, ${periodEnd})
  `;
}

export async function readPlan(db: Db, code: string): Promise<PlanRow> {
  const rows = await db<PlanRow[]>`
    select code, name, price_idr, interval, limits from plans where code = ${code}
  `;
  const plan = rows[0];
  if (!plan) throw new Error(`e2e: plan ${code} is missing.`);
  return plan;
}

export async function readPayments(db: Db, userId: string): Promise<PaymentRow[]> {
  return db<PaymentRow[]>`
    select midtrans_order_id as order_id, midtrans_status as status,
           amount_idr, paid_at
    from payments where user_id = ${userId}
    order by created_at asc, midtrans_order_id asc
  `;
}

export async function readSubscriptions(db: Db, userId: string): Promise<SubscriptionRow[]> {
  return db<SubscriptionRow[]>`
    select plan_code, status, current_period_start as period_start,
           current_period_end as period_end
    from subscriptions where user_id = ${userId}
    order by current_period_end desc
  `;
}

export async function readByokRow(db: Db, userId: string): Promise<ByokRow | null> {
  const rows = await db<ByokRow[]>`
    select last4, connected_via, encrypted_key, iv, auth_tag, key_version, verified_at
    from byok_keys where user_id = ${userId} and revoked_at is null limit 1
  `;
  return rows[0] ?? null;
}

export async function readLatestAiCall(
  db: Db,
  userId: string,
  task: string,
): Promise<AiCallRow | null> {
  const rows = await db<AiCallRow[]>`
    select task, model, byok, status from ai_calls
    where user_id = ${userId} and task = ${task}
    order by created_at desc limit 1
  `;
  return rows[0] ?? null;
}

/** A pending order owned by another user, used only to prove isolation. */
export async function insertForeignOrder(
  db: Db,
  input: { userId: string; planCode: string; orderId: string; amountIdr: number },
): Promise<void> {
  await db`
    insert into payments (user_id, kind, ref_id, amount_idr, midtrans_order_id, midtrans_status)
    select ${input.userId}, 'subscription', id, ${input.amountIdr},
           ${input.orderId}, 'pending'
    from plans where code = ${input.planCode}
  `;
}

export async function deleteOrder(db: Db, orderId: string): Promise<void> {
  await db`delete from payments where midtrans_order_id = ${orderId}`;
}

export type NotificationInput = {
  orderId: string;
  grossAmount: string;
  transactionStatus: string;
  fraudStatus?: string | null;
  statusCode?: string;
  serverKey?: string;
  settlementTime?: string | null;
};

/** Deliver a signed Midtrans notification to the app and return its HTTP status. */
export async function sendSignedNotification(input: NotificationInput): Promise<number> {
  const statusCode = input.statusCode ?? '200';
  const signature_key = midtransSignature(
    input.orderId,
    statusCode,
    input.grossAmount,
    input.serverKey ?? E2E_MIDTRANS_SERVER_KEY,
  );
  const response = await fetch(`${E2E_BASE_URL}/api/webhooks/midtrans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: input.orderId,
      status_code: statusCode,
      gross_amount: input.grossAmount,
      signature_key,
      transaction_status: input.transactionStatus,
      fraud_status: input.fraudStatus ?? null,
      payment_type: 'bank_transfer',
      settlement_time: input.settlementTime ?? null,
    }),
  });
  return response.status;
}
