import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { BillingError } from '@/lib/billing/errors';

/**
 * Midtrans Snap client (server only). The server key is read from the
 * environment on every call and never appears in an error, log or response.
 */
const SANDBOX_SNAP_URL = 'https://app.sandbox.midtrans.com/snap/v1/transactions';
const PRODUCTION_SNAP_URL = 'https://app.midtrans.com/snap/v1/transactions';
const SNAP_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

const SnapResponse = z.object({
  token: z.string().min(1),
  redirect_url: z.string().url(),
});
export type SnapResponse = z.infer<typeof SnapResponse>;

export type SnapCustomer = { firstName: string; email: string };

export type SnapTransactionInput = {
  orderId: string;
  grossAmount: number;
  planName: string;
  planCode?: string;
  customer: SnapCustomer;
  finishUrl: string;
};

export type SnapTransactionResult = { token: string; redirectUrl: string };

export type NotificationSignatureInput = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
};

export type TransactionStatusInput = {
  transaction_status?: string | null;
  fraud_status?: string | null;
};

/** `paid` activates a plan; `pending` waits; `failed` never activates. */
export type MappedPaymentStatus = 'paid' | 'pending' | 'failed';

type MidtransEnv = { [key: string]: string | undefined };

function readServerKey(env: MidtransEnv): string {
  const key = env.MIDTRANS_SERVER_KEY?.trim();
  if (!key) throw new BillingError('configurationMissing');
  return key;
}

/** Sandbox by default; `MIDTRANS_IS_PRODUCTION=true` switches to production. */
export function getSnapUrl(env: MidtransEnv = process.env): string {
  const override = env.MIDTRANS_SNAP_URL?.trim();
  if (override) return override;
  return env.MIDTRANS_IS_PRODUCTION?.trim() === 'true' ? PRODUCTION_SNAP_URL : SANDBOX_SNAP_URL;
}

/** Back to the subscription settings page, with the order id for the status view. */
export function buildFinishUrl(orderId: string, appUrl?: string | null): string {
  const path = `/settings/langganan?order=${encodeURIComponent(orderId)}`;
  const base = appUrl?.trim();
  if (!base) return path;
  try {
    return new URL(path, base).toString();
  } catch {
    return path;
  }
}

export function buildSnapRequestBody(input: SnapTransactionInput): Record<string, unknown> {
  const item: Record<string, unknown> = {
    name: input.planName,
    price: input.grossAmount,
    quantity: 1,
  };
  if (input.planCode) item.id = input.planCode;

  return {
    transaction_details: {
      order_id: input.orderId,
      gross_amount: input.grossAmount,
    },
    item_details: [item],
    customer_details: {
      first_name: input.customer.firstName,
      email: input.customer.email,
    },
    callbacks: { finish: input.finishUrl },
  };
}

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new BillingError('midtransInvalidResponse');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Create a Snap transaction. No network in tests: the caller mocks `fetch`. */
export async function createSnapTransaction(
  input: SnapTransactionInput,
  options: { env?: MidtransEnv; fetcher?: typeof fetch } = {},
): Promise<SnapTransactionResult> {
  const env = options.env ?? process.env;
  const serverKey = readServerKey(env);
  const fetcher = options.fetcher ?? fetch;
  const url = getSnapUrl(env);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SNAP_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`,
      },
      body: JSON.stringify(buildSnapRequestBody(input)),
      signal: controller.signal,
    });

    const text = await readBoundedText(response);
    if (!response.ok) throw new BillingError('midtransFailed');

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new BillingError('midtransInvalidResponse');
    }
    const parsed = SnapResponse.safeParse(json);
    if (!parsed.success) throw new BillingError('midtransInvalidResponse');
    return { token: parsed.data.token, redirectUrl: parsed.data.redirect_url };
  } catch (error) {
    if (error instanceof BillingError) throw error;
    throw new BillingError('midtransUnavailable');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `sha512(order_id + status_code + gross_amount + server_key)` compared in
 * constant time. A missing key is a configuration error, not a valid signature.
 */
export function verifyNotificationSignature(
  input: NotificationSignatureInput,
  env: MidtransEnv = process.env,
): boolean {
  const serverKey = readServerKey(env);
  const expected = createHash('sha512')
    .update(`${input.order_id}${input.status_code}${input.gross_amount}${serverKey}`)
    .digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(input.signature_key, 'hex');
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** Map Midtrans statuses to the only three outcomes the webhook may act on. */
export function mapTransactionStatus(input: TransactionStatusInput): MappedPaymentStatus {
  const status = input.transaction_status?.trim().toLowerCase();
  const fraud = input.fraud_status?.trim().toLowerCase();

  if (status === 'settlement') return 'paid';
  if (status === 'capture') return fraud === 'accept' ? 'paid' : 'failed';
  if (status === 'pending' || status === 'authorize') return 'pending';
  if (status === 'deny' || status === 'cancel' || status === 'expire' || status === 'failure') {
    return 'failed';
  }
  return 'pending';
}
