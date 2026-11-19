import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { BillingError } from '@/lib/billing/errors';
import {
  MAX_PENDING_ORDERS,
  buildSubscriptionPaymentValues,
  createSubscriptionOrder,
  generateOrderId,
  type CheckoutDatabase,
} from '@/lib/billing/checkout';
import { createRecordingDatabase } from '../library/recording-db';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const PLAN_ID = '11111111-2222-4333-8444-555555555555';
const SERVER_KEY = 'SB-Mid-server-test-key';
const NOW = new Date('2026-11-19T08:00:00.000Z');

const planRow = {
  id: PLAN_ID,
  code: 'pro_monthly',
  name: 'Pro Bulanan',
  priceIdr: 59000,
  interval: 'month',
  isActive: true,
};

const savedEnv = {
  MIDTRANS_SERVER_KEY: process.env.MIDTRANS_SERVER_KEY,
  MIDTRANS_SNAP_URL: process.env.MIDTRANS_SNAP_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

beforeEach(() => {
  process.env.MIDTRANS_SERVER_KEY = SERVER_KEY;
  process.env.MIDTRANS_SNAP_URL = 'https://midtrans.test/snap/v1/transactions';
  process.env.NEXT_PUBLIC_APP_URL = 'https://unbookin.test';
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

function databaseWith(results: unknown[][]): {
  database: CheckoutDatabase;
  queries: ReturnType<typeof createRecordingDatabase>['queries'];
} {
  const { database, queries } = createRecordingDatabase(results);
  return { database: database as unknown as CheckoutDatabase, queries };
}

function snapOk(): ReturnType<typeof vi.fn> {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ token: 'tok-1', redirect_url: 'https://snap.test/tok-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

async function codeOf(action: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await action();
  } catch (error) {
    return error instanceof BillingError ? error.code : undefined;
  }
}

describe('generateOrderId', () => {
  it('is unique, readable and at most 50 characters', () => {
    const a = generateOrderId(NOW.getTime(), Buffer.from('aabbccddeeff', 'hex'));
    const b = generateOrderId(NOW.getTime(), Buffer.from('001122334455', 'hex'));
    expect(a).toBe('UB-mwn9fcw0-aabbccddeeff');
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(50);
    expect(a).toMatch(/^UB-[0-9a-z]+-[0-9a-f]+$/);
  });
});

describe('buildSubscriptionPaymentValues', () => {
  it('takes the amount and plan from the plan row, never from the caller', () => {
    const values = buildSubscriptionPaymentValues(
      { id: PLAN_ID, code: 'pro_monthly', priceIdr: 59000 },
      USER_ID,
      'UB-1',
    );
    expect(values).toEqual({
      userId: USER_ID,
      kind: 'subscription',
      refId: PLAN_ID,
      amountIdr: 59000,
      midtransOrderId: 'UB-1',
      midtransStatus: 'pending',
    });
  });

  it('refuses the free plan and zero-priced plans', () => {
    expect(() =>
      buildSubscriptionPaymentValues({ id: PLAN_ID, code: 'free', priceIdr: 0 }, USER_ID, 'UB-1'),
    ).toThrow(BillingError);
    expect(() =>
      buildSubscriptionPaymentValues(
        { id: PLAN_ID, code: 'pro_monthly', priceIdr: 0 },
        USER_ID,
        'UB-1',
      ),
    ).toThrow(BillingError);
  });
});

describe('createSubscriptionOrder', () => {
  it('inserts the order intent from the plan row and returns the Snap token', async () => {
    const fetcher = snapOk();
    vi.stubGlobal('fetch', fetcher);
    const { database, queries } = databaseWith([
      [planRow],
      [{ value: 0 }],
      [{ name: 'Siti Aminah', email: 'siti@example.com' }],
      [{ id: 'pay-1' }],
    ]);

    const result = await createSubscriptionOrder(USER_ID, 'pro_monthly', {
      database,
      now: NOW,
    });

    expect(result.token).toBe('tok-1');
    expect(result.redirectUrl).toBe('https://snap.test/tok-1');
    expect(result.orderId).toMatch(/^UB-/);

    const insert = queries.find((query) => query.sql.startsWith('insert into "payments"'));
    expect(insert).toBeDefined();
    expect(insert?.params).toEqual(
      expect.arrayContaining([USER_ID, 'subscription', PLAN_ID, 59000, result.orderId, 'pending']),
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(process.env.MIDTRANS_SNAP_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(`${SERVER_KEY}:`).toString('base64')}`);
    const body = JSON.parse(String(init.body)) as {
      transaction_details: { order_id: string; gross_amount: number };
      item_details: Array<{ name: string; price: number }>;
      customer_details: Record<string, string>;
      callbacks: { finish: string };
    };
    expect(body.transaction_details).toEqual({
      order_id: result.orderId,
      gross_amount: 59000,
    });
    expect(body.item_details[0]).toMatchObject({ name: 'Pro Bulanan', price: 59000 });
    expect(body.customer_details).toEqual({
      first_name: 'Siti',
      email: 'siti@example.com',
    });
    expect(body.callbacks.finish).toBe(
      `https://unbookin.test/settings/langganan?order=${result.orderId}`,
    );
  });

  it('stops at 3 pending orders inside the 10-minute window', async () => {
    const fetcher = snapOk();
    vi.stubGlobal('fetch', fetcher);
    const { database, queries } = databaseWith([[planRow], [{ value: MAX_PENDING_ORDERS }]]);

    expect(
      await codeOf(() => createSubscriptionOrder(USER_ID, 'pro_monthly', { database, now: NOW })),
    ).toBe('orderLimitReached');
    expect(fetcher).not.toHaveBeenCalled();
    expect(queries).toHaveLength(2);
    expect(queries[1]?.sql).toContain('count(*)');
    expect(queries[1]?.params).toContain('pending');
    expect(queries[1]?.params).toContain(new Date(NOW.getTime() - 10 * 60 * 1000).toISOString());
  });

  it('rejects a missing or inactive plan', async () => {
    const { database } = databaseWith([[]]);
    expect(
      await codeOf(() => createSubscriptionOrder(USER_ID, 'pro_monthly', { database, now: NOW })),
    ).toBe('planUnavailable');
  });

  it('rejects the free plan before storing anything', async () => {
    const { database, queries } = databaseWith([[{ ...planRow, code: 'free', priceIdr: 0 }]]);
    expect(
      await codeOf(() => createSubscriptionOrder(USER_ID, 'free', { database, now: NOW })),
    ).toBe('freePlanNotPurchasable');
    expect(queries).toHaveLength(1);
  });

  it('rejects a user that does not exist', async () => {
    const { database } = databaseWith([[planRow], [{ value: 0 }], []]);
    expect(
      await codeOf(() => createSubscriptionOrder(USER_ID, 'pro_monthly', { database, now: NOW })),
    ).toBe('invalidInput');
  });

  it('rejects an invalid user id before querying', async () => {
    const { database, queries } = databaseWith([]);
    expect(
      await codeOf(() => createSubscriptionOrder('not-a-uuid', 'pro_monthly', { database })),
    ).toBe('invalidInput');
    expect(queries).toHaveLength(0);
  });

  it('marks the payment failed when Midtrans fails, then throws a safe code', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('network down');
    });
    vi.stubGlobal('fetch', fetcher);
    const { database, queries } = databaseWith([
      [planRow],
      [{ value: 0 }],
      [{ name: 'Siti', email: 'siti@example.com' }],
      [{ id: 'pay-1' }],
      [],
    ]);

    expect(
      await codeOf(() => createSubscriptionOrder(USER_ID, 'pro_monthly', { database, now: NOW })),
    ).toBe('midtransUnavailable');

    const update = queries.find((query) => query.sql.startsWith('update "payments"'));
    expect(update).toBeDefined();
    expect(update?.sql).toContain('"midtrans_status"');
    expect(update?.params).toContain('failed');
    expect(update?.params.some((value) => String(value).startsWith('UB-'))).toBe(true);
  });
});
