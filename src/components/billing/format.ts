/** UI-only helpers for the subscription screens (no server imports). */

export const RENEW_SOON_DAYS = 7;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type PaymentStatus = 'pending' | 'paid' | 'failed';

/** Whole days left in a paid period, rounded up; never negative. */
export function daysUntil(end: string | Date, now: Date = new Date()): number {
  const endDate = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / DAY_MS));
}

/** Renewal reminder threshold (E11-02 AC3). */
export function isRenewSoon(daysLeft: number | null | undefined): boolean {
  return typeof daysLeft === 'number' && daysLeft <= RENEW_SOON_DAYS;
}

/** Deterministic `id-ID` long date (Jakarta) so SSR and hydration agree. */
export function formatPeriodDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

/** Midtrans statuses stored on `payments` mapped to the three UI states. */
export function toPaymentStatus(raw: string | null | undefined): PaymentStatus {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'settlement':
    case 'capture':
    case 'paid':
      return 'paid';
    case 'deny':
    case 'cancel':
    case 'expire':
    case 'failure':
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}
/**
 * Map a safe billing error code to a calm message key under the `billing`
 * namespace. Unknown codes fall back to a generic sentence.
 */
export function billingErrorKey(code: string | null | undefined):
  | 'langganan.errors.orderLimitReached'
  | 'langganan.errors.planUnavailable'
  | 'langganan.errors.paymentNotFound'
  | 'langganan.errors.midtransUnavailable'
  | 'langganan.errors.generic' {
  switch (code) {
    case 'orderLimitReached':
      return 'langganan.errors.orderLimitReached';
    case 'planUnavailable':
    case 'freePlanNotPurchasable':
      return 'langganan.errors.planUnavailable';
    case 'paymentNotFound':
      return 'langganan.errors.paymentNotFound';
    case 'midtransUnavailable':
    case 'midtransFailed':
    case 'midtransInvalidResponse':
      return 'langganan.errors.midtransUnavailable';
    default:
      return 'langganan.errors.generic';
  }
}
