import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { payments } from '@/db/schema';
import { mapTransactionStatus, verifyNotificationSignature } from '@/lib/billing/midtrans';
import {
  FAILED_PAYMENT_STATUSES,
  applyPaidPayment,
  markPaymentFailed,
  type FailedPaymentStatus,
} from '@/lib/billing/subscriptions';

/**
 * Midtrans notification processing (E11-02 AC2, PRD §11). The signature is
 * checked before any read or write; the amount must equal the stored order
 * amount; activation goes through the same transactional helpers as checkout.
 * Nothing here logs the body, the server key or customer data.
 */

export const midtransSignatureSchema = z.object({
  order_id: z.string().min(1),
  status_code: z.string().min(1),
  gross_amount: z.string().min(1),
  signature_key: z.string().min(1),
});

export const midtransNotificationSchema = midtransSignatureSchema.extend({
  transaction_status: z.string().min(1),
  fraud_status: z.string().nullish(),
  payment_type: z.string().nullish(),
  settlement_time: z.string().nullish(),
  transaction_time: z.string().nullish(),
});

export type MidtransNotification = z.infer<typeof midtransNotificationSchema>;

const REDACTED_KEY_PATTERNS = [
  /^signature_key$/i,
  /^va_numbers?$/i,
  /va_?number/i,
  /virtual_account/i,
  /^card/i,
  /^masked_card/i,
  /^pan$/i,
  /token_id/i,
  /^bill_key$/i,
  /^biller_code$/i,
];

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEY_PATTERNS.some((pattern) => pattern.test(key))) continue;
      out[key] = redactValue(inner);
    }
    return out;
  }
  return value;
}

/** Drop the signature and any card/VA number while keeping status fields. */
export function redactNotification(record: Record<string, unknown>): Record<string, unknown> {
  return redactValue(record) as Record<string, unknown>;
}

const MIDTRANS_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

/** Midtrans timestamps are GMT+7 unless an explicit offset is present. */
function parseSettlementTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = value.trim();
  const match = MIDTRANS_TIME.exec(text);
  if (match) {
    const [, year, month, day, hour, minute, second, millis] = match;
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${millis ? `.${millis}` : ''}+07:00`;
    const zoned = new Date(iso);
    if (!Number.isNaN(zoned.getTime())) return zoned;
  }
  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

const AMOUNT = /^(\d+)(?:\.(\d{1,2}))?$/;

/** `gross_amount` is a decimal string ("59000.00"); compare it exactly in IDR. */
function amountMatches(grossAmount: string, amountIdr: number): boolean {
  const match = AMOUNT.exec(grossAmount.trim());
  if (!match) return false;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  if (fraction !== '00') return false;
  try {
    return BigInt(match[1]!) === BigInt(amountIdr);
  } catch {
    return false;
  }
}

function failedStatusFor(data: MidtransNotification): FailedPaymentStatus {
  const raw = data.transaction_status.trim().toLowerCase();
  if ((FAILED_PAYMENT_STATUSES as readonly string[]).includes(raw)) {
    return raw as FailedPaymentStatus;
  }
  return 'failure';
}

/** Verify a notification or status-API payload; a config error is not a valid signature. */
export function verifyMidtransPayload(record: Record<string, unknown>): boolean {
  const signature = midtransSignatureSchema.safeParse(record);
  if (!signature.success) return false;
  return verifyNotificationSignature(signature.data);
}

type ApplyOptions = { expectedUserId?: string };

async function markAmountMismatch(
  paymentId: string,
  record: Record<string, unknown>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ paidAt: payments.paidAt, midtransStatus: payments.midtransStatus })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .for('update')
      .limit(1);
    if (!current || current.paidAt || current.midtransStatus === 'paid') return;
    await tx
      .update(payments)
      .set({ midtransStatus: 'amount_mismatch', raw: redactNotification(record) })
      .where(eq(payments.id, paymentId));
  });
}

/**
 * Apply an already signature-verified notification in one transaction. Used by
 * both the webhook route and the server-to-server status sync.
 */
export async function applyVerifiedNotification(
  record: Record<string, unknown>,
  data: MidtransNotification,
  options: ApplyOptions = {},
): Promise<{ status: number }> {
  try {
    const [payment] = await db
      .select({ id: payments.id, userId: payments.userId, amountIdr: payments.amountIdr })
      .from(payments)
      .where(eq(payments.midtransOrderId, data.order_id))
      .limit(1);

    if (!payment) return { status: 404 };
    if (options.expectedUserId && payment.userId !== options.expectedUserId) {
      return { status: 404 };
    }

    if (!amountMatches(data.gross_amount, payment.amountIdr)) {
      await markAmountMismatch(payment.id, record);
      console.warn(`midtrans amount mismatch for order ${data.order_id}: amount_mismatch`);
      return { status: 200 };
    }

    const redacted = redactNotification(record);
    await db.transaction(async (tx) => {
      const mapped = mapTransactionStatus(data);
      if (mapped === 'paid') {
        const paidAt = parseSettlementTime(data.settlement_time) ?? new Date();
        await applyPaidPayment(tx, payment.id, paidAt);
      } else if (mapped === 'failed') {
        await markPaymentFailed(tx, payment.id, failedStatusFor(data));
      }

      if (mapped === 'pending') {
        await tx
          .update(payments)
          .set({ paymentType: data.payment_type ?? null, raw: redacted })
          .where(eq(payments.id, payment.id));
      } else {
        await tx.update(payments).set({ raw: redacted }).where(eq(payments.id, payment.id));
      }
    });

    return { status: 200 };
  } catch {
    console.error(`midtrans notification failed for order ${data.order_id}: processingFailed`);
    return { status: 500 };
  }
}

export async function processMidtransNotification(body: unknown): Promise<{ status: number }> {
  const record = toRecord(body);
  if (!record) return { status: 400 };

  let valid: boolean;
  try {
    valid = verifyMidtransPayload(record);
  } catch {
    return { status: 500 };
  }
  if (!valid) return { status: 401 };

  const parsed = midtransNotificationSchema.safeParse(record);
  if (!parsed.success) return { status: 400 };

  return applyVerifiedNotification(record, parsed.data);
}