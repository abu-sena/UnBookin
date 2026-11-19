import 'server-only';
import type { Plan } from '@/db/schema';
import { BillingError } from '@/lib/billing/errors';

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
  void identity;
  void orderId;
  throw new BillingError('midtransUnavailable');
}
