import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { payments, plans, type Plan } from '@/db/schema';
import { BillingError } from '@/lib/billing/errors';
import {
  applyVerifiedNotification,
  midtransNotificationSchema,
  verifyMidtransPayload,
} from '@/lib/billing/notifications';

/**
 * Contract between the Midtrans webhook worker and the subscription UI (M8 wave 2). The UI calls
 * `syncOrderStatus` when the user comes back from Snap; the webhook task implements it (read the
 * owned order, and when it is still pending ask Midtrans server-to-server, then apply it exactly like
 * a notification would). The browser redirect itself never activates a plan.
 */

export type OrderStatus = 'pending' | 'paid' | 'failed';

export type OrderStatusView = {
  orderId: string;
  status: OrderStatus;
  planCode: Plan['code'];
  amountIdr: number;
  /** ISO time the payment settled, or `null` while pending/failed. */
  paidAt: string | null;
};

/** Owned order only; another user's order id is `paymentNotFound`. Implemented by the webhook task. */
export async function syncOrderStatus(
  identity: { userId: string },
  orderId: string,
): Promise<OrderStatusView> {
  const [payment] = await db
    .select({
      id: payments.id,
      refId: payments.refId,
      amountIdr: payments.amountIdr,
      midtransStatus: payments.midtransStatus,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(and(eq(payments.midtransOrderId, orderId), eq(payments.userId, identity.userId)))
    .limit(1);

  if (!payment) throw new BillingError('paymentNotFound');

  const [plan] = payment.refId
    ? await db
        .select({ code: plans.code })
        .from(plans)
        .where(eq(plans.id, payment.refId))
        .limit(1)
    : [];
  if (!plan) throw new BillingError('paymentNotFound');

  const view = (status: OrderStatus, paidAt: Date | null): OrderStatusView => ({
    orderId,
    status,
    planCode: plan.code,
    amountIdr: payment.amountIdr,
    paidAt: paidAt ? paidAt.toISOString() : null,
  });

  const terminal = (value: string): OrderStatus => {
    if (value === 'paid') return 'paid';
    if (
      ['deny', 'cancel', 'expire', 'failure', 'failed', 'amount_mismatch'].includes(value)
    ) {
      return 'failed';
    }
    return 'pending';
  };

  const current = terminal(payment.midtransStatus);
  if (payment.paidAt || current !== 'pending') return view(current, payment.paidAt);

  const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim();
  if (!serverKey) return view('pending', null);

  const override = process.env.MIDTRANS_API_URL?.trim();
  const base = override
    ? override.replace(/\/+$/, '')
    : process.env.MIDTRANS_IS_PRODUCTION?.trim() === 'true'
      ? 'https://api.midtrans.com'
      : 'https://api.sandbox.midtrans.com';
  const url = `${base}/v2/${encodeURIComponent(orderId)}/status`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let record: Record<string, unknown> | null = null;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`,
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (response.ok && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let total = 0;
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 64 * 1024) {
          await reader.cancel();
          text = '';
          break;
        }
        text += decoder.decode(value, { stream: true });
      }
      if (text) {
        text += decoder.decode();
        try {
          const json: unknown = JSON.parse(text);
          record =
            json && typeof json === 'object' && !Array.isArray(json)
              ? (json as Record<string, unknown>)
              : null;
        } catch {
          record = null;
        }
      }
    }
  } catch {
    record = null;
  } finally {
    clearTimeout(timer);
  }

  if (!record) return view('pending', null);

  let valid = false;
  try {
    valid = verifyMidtransPayload(record);
  } catch {
    valid = false;
  }
  if (!valid) return view('pending', null);

  const parsed = midtransNotificationSchema.safeParse(record);
  if (!parsed.success) return view('pending', null);

  const applied = await applyVerifiedNotification(record, parsed.data, {
    expectedUserId: identity.userId,
  });
  if (applied.status === 404) throw new BillingError('paymentNotFound');
  if (applied.status !== 200) return view('pending', null);

  const [updated] = await db
    .select({ midtransStatus: payments.midtransStatus, paidAt: payments.paidAt })
    .from(payments)
    .where(eq(payments.id, payment.id))
    .limit(1);
  if (!updated) throw new BillingError('paymentNotFound');
  return view(terminal(updated.midtransStatus), updated.paidAt);
}
