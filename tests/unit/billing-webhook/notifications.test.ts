import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const state = {
    payment: null as Record<string, unknown> | null,
    selectCalls: 0,
    updates: [] as Array<Record<string, unknown>>,
    applyCalls: [] as Array<{ paymentId: string; paidAt: Date }>,
    failCalls: [] as Array<{ paymentId: string; status: string }>,
    activations: 0,
    transactionError: false,
  };

  const chain = (rows: unknown[]) => {
    const value: Record<string, unknown> = {};
    value.from = () => value;
    value.where = () => value;
    value.for = () => value;
    value.limit = async () => rows;
    return value;
  };

  const tx = {
    select: () => chain(state.payment ? [state.payment] : []),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        if (state.payment) Object.assign(state.payment, values);
        return { where: async () => undefined };
      },
    }),
  };

  return { state, chain, tx };
});

vi.mock('@/db', () => ({
  db: {
    select: () => {
      mocks.state.selectCalls += 1;
      return mocks.chain(mocks.state.payment ? [mocks.state.payment] : []);
    },
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      if (mocks.state.transactionError) throw new Error('database down');
      return callback(mocks.tx);
    },
  },
}));

vi.mock('@/lib/billing/subscriptions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/subscriptions')>();
  return {
    ...actual,
    applyPaidPayment: vi.fn(async (_tx: unknown, paymentId: string, paidAt: Date) => {
      mocks.state.applyCalls.push({ paymentId, paidAt });
      if (!mocks.state.payment) return { applied: false };
      if (mocks.state.payment.paidAt || mocks.state.payment.midtransStatus === 'paid') {
        return { applied: false };
      }
      mocks.state.payment.paidAt = paidAt;
      mocks.state.payment.midtransStatus = 'paid';
      mocks.state.activations += 1;
      return { applied: true };
    }),
    markPaymentFailed: vi.fn(async (_tx: unknown, paymentId: string, status: string) => {
      mocks.state.failCalls.push({ paymentId, status });
      if (!mocks.state.payment) return { updated: false };
      if (mocks.state.payment.paidAt || mocks.state.payment.midtransStatus === 'paid') {
        return { updated: false };
      }
      mocks.state.payment.midtransStatus = status;
      return { updated: true };
    }),
  };
});

import { processMidtransNotification } from '@/lib/billing/notifications';

const SERVER_KEY = 'SB-Mid-server-webhook-test';
const ORDER_ID = 'UB-m8test-order1';
const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function sign(orderId: string, statusCode: string, grossAmount: string): string {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`)
    .digest('hex');
}

function signed(fields: Record<string, unknown>): Record<string, unknown> {
  const orderId = String(fields.order_id ?? ORDER_ID);
  const statusCode = String(fields.status_code ?? '200');
  const grossAmount = String(fields.gross_amount ?? '59000.00');
  return {
    ...fields,
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: sign(orderId, statusCode, grossAmount),
  };
}

beforeEach(() => {
  process.env.MIDTRANS_SERVER_KEY = SERVER_KEY;
  process.env.MIDTRANS_IS_PRODUCTION = 'false';
  mocks.state.payment = {
    id: PAYMENT_ID,
    userId: USER_ID,
    amountIdr: 59000,
    midtransStatus: 'pending',
    paidAt: null,
    paymentType: null,
    raw: null,
  };
  mocks.state.selectCalls = 0;
  mocks.state.updates = [];
  mocks.state.applyCalls = [];
  mocks.state.failCalls = [];
  mocks.state.activations = 0;
  mocks.state.transactionError = false;
});

afterEach(() => {
});

describe('processMidtransNotification', () => {
  it('activates once for a settled payment using the settlement time', async () => {
    const body = signed({
      transaction_status: 'settlement',
      settlement_time: '2026-11-19 15:00:00',
      payment_type: 'bank_transfer',
    });

    await expect(processMidtransNotification(body)).resolves.toEqual({ status: 200 });
    expect(mocks.state.applyCalls).toHaveLength(1);
    expect(mocks.state.applyCalls[0]?.paidAt.toISOString()).toBe('2026-11-19T08:00:00.000Z');
    expect(mocks.state.activations).toBe(1);
  });

  it('treats capture with fraud accept as paid and other captures as failed', async () => {
    await expect(
      processMidtransNotification(
        signed({ transaction_status: 'capture', fraud_status: 'accept' }),
      ),
    ).resolves.toEqual({ status: 200 });
    expect(mocks.state.activations).toBe(1);

    mocks.state.payment!.midtransStatus = 'pending';
    mocks.state.payment!.paidAt = null;
    await expect(
      processMidtransNotification(
        signed({ transaction_status: 'capture', fraud_status: 'challenge' }),
      ),
    ).resolves.toEqual({ status: 200 });
    expect(mocks.state.failCalls.at(-1)?.status).toBe('failure');
  });

  it.each(['deny', 'cancel', 'expire', 'failure'] as const)(
    'marks %s as failed without activating',
    async (status) => {
      await expect(
        processMidtransNotification(signed({ transaction_status: status })),
      ).resolves.toEqual({ status: 200 });
      expect(mocks.state.activations).toBe(0);
      expect(mocks.state.failCalls.at(-1)?.status).toBe(status);
      expect(mocks.state.payment!.midtransStatus).toBe(status);
    },
  );

  it('stores only payment_type for a pending notification', async () => {
    await expect(
      processMidtransNotification(
        signed({ transaction_status: 'pending', payment_type: 'qris' }),
      ),
    ).resolves.toEqual({ status: 200 });
    expect(mocks.state.activations).toBe(0);
    expect(mocks.state.failCalls).toHaveLength(0);
    expect(mocks.state.payment!.midtransStatus).toBe('pending');
    expect(mocks.state.payment!.paymentType).toBe('qris');
  });

  it('returns 401 for a bad or missing signature before reading the database', async () => {
    await expect(
      processMidtransNotification({
        order_id: ORDER_ID,
        status_code: '200',
        gross_amount: '59000.00',
        signature_key: 'a'.repeat(128),
        transaction_status: 'settlement',
      }),
    ).resolves.toEqual({ status: 401 });
    expect(mocks.state.selectCalls).toBe(0);

    await expect(
      processMidtransNotification({
        order_id: ORDER_ID,
        status_code: '200',
        gross_amount: '59000.00',
        transaction_status: 'settlement',
      }),
    ).resolves.toEqual({ status: 401 });
    expect(mocks.state.selectCalls).toBe(0);
  });

  it('returns 400 for a malformed body and for a signed but incomplete notification', async () => {
    await expect(processMidtransNotification(null)).resolves.toEqual({ status: 400 });
    await expect(processMidtransNotification('text')).resolves.toEqual({ status: 400 });

    const incomplete = signed({});
    delete incomplete.transaction_status;
    await expect(processMidtransNotification(incomplete)).resolves.toEqual({ status: 400 });
  });

  it('returns 404 for an unknown order and writes nothing', async () => {
    mocks.state.payment = null;
    await expect(
      processMidtransNotification(signed({ transaction_status: 'settlement' })),
    ).resolves.toEqual({ status: 404 });
    expect(mocks.state.updates).toHaveLength(0);
    expect(mocks.state.applyCalls).toHaveLength(0);
  });

  it('marks an amount mismatch, never activates and returns 200', async () => {
    await expect(
      processMidtransNotification(
        signed({ transaction_status: 'settlement', gross_amount: '58000.00' }),
      ),
    ).resolves.toEqual({ status: 200 });
    expect(mocks.state.payment!.midtransStatus).toBe('amount_mismatch');
    expect(mocks.state.applyCalls).toHaveLength(0);
    expect(mocks.state.activations).toBe(0);
  });

  it('is idempotent for duplicate settlement notifications', async () => {
    const body = signed({ transaction_status: 'settlement' });
    await expect(processMidtransNotification(body)).resolves.toEqual({ status: 200 });
    await expect(processMidtransNotification(body)).resolves.toEqual({ status: 200 });
    expect(mocks.state.activations).toBe(1);
    expect(mocks.state.payment!.midtransStatus).toBe('paid');
  });

  it('keeps a settled payment paid when an expire arrives later', async () => {
    await expect(
      processMidtransNotification(signed({ transaction_status: 'settlement' })),
    ).resolves.toEqual({ status: 200 });
    await expect(
      processMidtransNotification(signed({ transaction_status: 'expire' })),
    ).resolves.toEqual({ status: 200 });
    expect(mocks.state.payment!.midtransStatus).toBe('paid');
    expect(mocks.state.activations).toBe(1);
  });

  it('redacts the signature and card/VA numbers but keeps status fields', async () => {
    await expect(
      processMidtransNotification(
        signed({
          transaction_status: 'settlement',
          card_number: '4111111111111111',
          va_numbers: [{ bank: 'bca', va_number: '123456789' }],
        }),
      ),
    ).resolves.toEqual({ status: 200 });

    const raw = mocks.state.payment!.raw as Record<string, unknown>;
    expect(raw.signature_key).toBeUndefined();
    expect(raw.card_number).toBeUndefined();
    expect(raw.va_numbers).toBeUndefined();
    expect(raw.transaction_status).toBe('settlement');
    expect(raw.order_id).toBe(ORDER_ID);
  });

  it('never logs the body, signature or server key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await processMidtransNotification(
      signed({
        transaction_status: 'settlement',
        gross_amount: '1.00',
        card_number: '4111111111111111',
      }),
    );
    mocks.state.transactionError = true;
    await processMidtransNotification(signed({ transaction_status: 'settlement' }));

    const logs = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
    expect(logs).toContain(ORDER_ID);
    expect(logs).toContain('amount_mismatch');
    expect(logs).not.toContain(SERVER_KEY);
    expect(logs).not.toContain('signature_key');
    expect(logs).not.toContain('4111111111111111');
  });

  it('returns 500 for an unexpected database error so Midtrans retries', async () => {
    mocks.state.transactionError = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      processMidtransNotification(signed({ transaction_status: 'settlement' })),
    ).resolves.toEqual({ status: 500 });
  });
});