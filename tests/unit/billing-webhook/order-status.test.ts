import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  state: {
    rows: [] as unknown[][],
    applyCalls: [] as Array<{ orderId: string; expectedUserId?: string }>,
  },
}));

vi.mock('@/db', () => {
  const chain = (rows: unknown[]) => {
    const value: Record<string, unknown> = {};
    value.from = () => value;
    value.where = () => value;
    value.limit = async () => rows;
    return value;
  };
  return { db: { select: () => chain(mocks.state.rows.shift() ?? []) } };
});

vi.mock('@/lib/billing/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/notifications')>();
  return {
    ...actual,
    applyVerifiedNotification: vi.fn(
      async (_record: unknown, data: { order_id: string }, options?: { expectedUserId?: string }) => {
        mocks.state.applyCalls.push({
          orderId: data.order_id,
          expectedUserId: options?.expectedUserId,
        });
        return { status: 200 };
      },
    ),
  };
});

import { syncOrderStatus } from '@/lib/billing/order-status';
import { applyVerifiedNotification } from '@/lib/billing/notifications';

const apply = vi.mocked(applyVerifiedNotification);
const SERVER_KEY = 'SB-Mid-server-status-test';
const ORDER_ID = 'UB-m8test-order1';
const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER = '44444444-4444-4444-8444-444444444444';
const API_BASE = 'https://midtrans.test';
const PAID_AT = new Date('2026-11-19T08:00:00.000Z');

const pendingPayment = {
  id: PAYMENT_ID,
  refId: PLAN_ID,
  amountIdr: 59000,
  midtransStatus: 'pending',
  paidAt: null,
};
const plan = { code: 'pro_monthly' };

function signedStatus(fields: Record<string, unknown>): Record<string, unknown> {
  const orderId = String(fields.order_id ?? ORDER_ID);
  const statusCode = String(fields.status_code ?? '200');
  const grossAmount = String(fields.gross_amount ?? '59000.00');
  const signature = createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${SERVER_KEY}`)
    .digest('hex');
  return {
    ...fields,
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: signature,
  };
}

function statusResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  process.env.MIDTRANS_SERVER_KEY = SERVER_KEY;
  process.env.MIDTRANS_API_URL = API_BASE;
  process.env.MIDTRANS_IS_PRODUCTION = 'false';
  mocks.state.rows = [];
  mocks.state.applyCalls = [];
  apply.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncOrderStatus', () => {
  it('never returns another user order', async () => {
    mocks.state.rows = [[]];
    await expect(syncOrderStatus({ userId: OTHER_USER }, ORDER_ID)).rejects.toMatchObject({
      code: 'paymentNotFound',
    });
    expect(mocks.state.applyCalls).toHaveLength(0);
  });

  it('returns an already paid order without calling Midtrans', async () => {
    mocks.state.rows = [[{ ...pendingPayment, midtransStatus: 'paid', paidAt: PAID_AT }], [plan]];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const view = await syncOrderStatus({ userId: USER_ID }, ORDER_ID);
    expect(view).toEqual({
      orderId: ORDER_ID,
      status: 'paid',
      planCode: 'pro_monthly',
      amountIdr: 59000,
      paidAt: PAID_AT.toISOString(),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an already failed order without calling Midtrans', async () => {
    mocks.state.rows = [[{ ...pendingPayment, midtransStatus: 'expire' }], [plan]];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const view = await syncOrderStatus({ userId: USER_ID }, ORDER_ID);
    expect(view.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks Midtrans for a pending order, verifies the signature and applies it', async () => {
    mocks.state.rows = [[pendingPayment], [plan], [{ midtransStatus: 'paid', paidAt: PAID_AT }]];
    const fetchMock = vi.fn(async () =>
      statusResponse(
        signedStatus({
          transaction_status: 'settlement',
          settlement_time: '2026-11-19 15:00:00',
          payment_type: 'bank_transfer',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const view = await syncOrderStatus({ userId: USER_ID }, ORDER_ID);
    expect(view.status).toBe('paid');
    expect(view.paidAt).toBe(PAID_AT.toISOString());
    expect(mocks.state.applyCalls).toEqual([
      { orderId: ORDER_ID, expectedUserId: USER_ID },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/v2/${encodeURIComponent(ORDER_ID)}/status`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from(`${SERVER_KEY}:`).toString('base64')}`,
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('ignores a status response with a bad signature', async () => {
    mocks.state.rows = [[pendingPayment], [plan]];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        statusResponse({
          ...signedStatus({ transaction_status: 'settlement' }),
          signature_key: 'a'.repeat(128),
        }),
      ),
    );

    const view = await syncOrderStatus({ userId: USER_ID }, ORDER_ID);
    expect(view.status).toBe('pending');
    expect(mocks.state.applyCalls).toHaveLength(0);
  });

  it('stays pending on a network failure', async () => {
    mocks.state.rows = [[pendingPayment], [plan]];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );

    const view = await syncOrderStatus({ userId: USER_ID }, ORDER_ID);
    expect(view.status).toBe('pending');
    expect(mocks.state.applyCalls).toHaveLength(0);
  });

  it('stays pending on a non-2xx status response', async () => {
    mocks.state.rows = [[pendingPayment], [plan]];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => statusResponse({ status_message: 'not found' }, 404)),
    );

    const view = await syncOrderStatus({ userId: USER_ID }, ORDER_ID);
    expect(view.status).toBe('pending');
    expect(mocks.state.applyCalls).toHaveLength(0);
  });
});