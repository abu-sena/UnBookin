import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { BillingError } from '@/lib/billing/errors';
import {
  buildFinishUrl,
  createSnapTransaction,
  getSnapUrl,
  mapTransactionStatus,
  verifyNotificationSignature,
  type SnapTransactionInput,
} from '@/lib/billing/midtrans';

const SERVER_KEY = 'SB-Mid-server-test-key';
const ENV = {
  MIDTRANS_SERVER_KEY: SERVER_KEY,
  MIDTRANS_SNAP_URL: 'https://midtrans.test/snap/v1/transactions',
  NEXT_PUBLIC_APP_URL: 'https://unbookin.test',
};

const input: SnapTransactionInput = {
  orderId: 'UB-m8test-abc123',
  grossAmount: 59000,
  planName: 'Pro Bulanan',
  planCode: 'pro_monthly',
  customer: { firstName: 'Siti', email: 'siti@example.com' },
  finishUrl: 'https://unbookin.test/settings/langganan?order=UB-m8test-abc123',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function codeOf(action: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await action();
  } catch (error) {
    return error instanceof BillingError ? error.code : undefined;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('getSnapUrl', () => {
  it('uses sandbox by default and production when enabled', () => {
    expect(getSnapUrl({})).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions');
    expect(getSnapUrl({ MIDTRANS_IS_PRODUCTION: 'true' })).toBe(
      'https://app.midtrans.com/snap/v1/transactions',
    );
    expect(getSnapUrl({ MIDTRANS_IS_PRODUCTION: 'false' })).toBe(
      'https://app.sandbox.midtrans.com/snap/v1/transactions',
    );
  });

  it('lets MIDTRANS_SNAP_URL override the derived URL', () => {
    expect(getSnapUrl({ MIDTRANS_SNAP_URL: 'http://127.0.0.1:9999/snap' })).toBe(
      'http://127.0.0.1:9999/snap',
    );
    expect(getSnapUrl({ MIDTRANS_SNAP_URL: '  ', MIDTRANS_IS_PRODUCTION: 'true' })).toBe(
      'https://app.midtrans.com/snap/v1/transactions',
    );
  });
});

describe('buildFinishUrl', () => {
  it('returns an absolute URL when the app URL is known', () => {
    expect(buildFinishUrl('UB-1', 'https://unbookin.test')).toBe(
      'https://unbookin.test/settings/langganan?order=UB-1',
    );
  });

  it('falls back to the path and encodes the order id', () => {
    expect(buildFinishUrl('UB 1/2')).toBe('/settings/langganan?order=UB%201%2F2');
    expect(buildFinishUrl('UB-1', 'not a url')).toBe('/settings/langganan?order=UB-1');
  });
});

describe('createSnapTransaction', () => {
  it('sends the exact Snap request body and Basic auth header', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ token: 'tok-123', redirect_url: 'https://snap.test/tok-123' }),
    );

    const result = await createSnapTransaction(input, {
      env: ENV,
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(result).toEqual({ token: 'tok-123', redirectUrl: 'https://snap.test/tok-123' });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENV.MIDTRANS_SNAP_URL);
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(`${SERVER_KEY}:`).toString('base64')}`);

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      transaction_details: { order_id: input.orderId, gross_amount: 59000 },
      item_details: [{ id: 'pro_monthly', name: 'Pro Bulanan', price: 59000, quantity: 1 }],
      customer_details: { first_name: 'Siti', email: 'siti@example.com' },
      callbacks: { finish: input.finishUrl },
    });
    expect(JSON.stringify(body)).not.toContain(SERVER_KEY);
  });

  it('requires a server key without leaking it in the error', async () => {
    const fetcher = vi.fn();
    let caught: unknown;
    try {
      await createSnapTransaction(input, { env: {}, fetcher: fetcher as unknown as typeof fetch });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BillingError);
    expect((caught as BillingError).code).toBe('configurationMissing');
    expect(String((caught as Error).message)).not.toContain(SERVER_KEY);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a response missing the required fields', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ token: 'tok-only' }));
    expect(
      await codeOf(() =>
        createSnapTransaction(input, { env: ENV, fetcher: fetcher as unknown as typeof fetch }),
      ),
    ).toBe('midtransInvalidResponse');
  });

  it('rejects invalid JSON', async () => {
    const fetcher = vi.fn(async () => new Response('not-json', { status: 200 }));
    expect(
      await codeOf(() =>
        createSnapTransaction(input, { env: ENV, fetcher: fetcher as unknown as typeof fetch }),
      ),
    ).toBe('midtransInvalidResponse');
  });

  it('maps a non-2xx response to midtransFailed', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error_messages: ['bad'] }, 401));
    expect(
      await codeOf(() =>
        createSnapTransaction(input, { env: ENV, fetcher: fetcher as unknown as typeof fetch }),
      ),
    ).toBe('midtransFailed');
  });

  it('maps a network failure to midtransUnavailable', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('network down');
    });
    expect(
      await codeOf(() =>
        createSnapTransaction(input, { env: ENV, fetcher: fetcher as unknown as typeof fetch }),
      ),
    ).toBe('midtransUnavailable');
  });

  it('aborts after the 15 s timeout', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const promise = createSnapTransaction(input, {
      env: ENV,
      fetcher: fetcher as unknown as typeof fetch,
    });
    const expectation = expect(promise).rejects.toMatchObject({ code: 'midtransUnavailable' });
    await vi.advanceTimersByTimeAsync(15_000);
    await expectation;
  });
});

describe('verifyNotificationSignature', () => {
  const payload = {
    order_id: 'UB-1',
    status_code: '200',
    gross_amount: '59000.00',
  };
  const signature = createHash('sha512')
    .update(`${payload.order_id}${payload.status_code}${payload.gross_amount}${SERVER_KEY}`)
    .digest('hex');

  it('accepts a signature built with the server key', () => {
    expect(
      verifyNotificationSignature(
        { ...payload, signature_key: signature },
        { MIDTRANS_SERVER_KEY: SERVER_KEY },
      ),
    ).toBe(true);
  });

  it('rejects a tampered amount or a wrong signature', () => {
    expect(
      verifyNotificationSignature(
        { ...payload, gross_amount: '1.00', signature_key: signature },
        { MIDTRANS_SERVER_KEY: SERVER_KEY },
      ),
    ).toBe(false);
    expect(
      verifyNotificationSignature(
        { ...payload, signature_key: 'a'.repeat(128) },
        { MIDTRANS_SERVER_KEY: SERVER_KEY },
      ),
    ).toBe(false);
    expect(
      verifyNotificationSignature(
        { ...payload, signature_key: 'not-hex' },
        { MIDTRANS_SERVER_KEY: SERVER_KEY },
      ),
    ).toBe(false);
  });

  it('throws configurationMissing when no server key exists', () => {
    let caught: unknown;
    try {
      verifyNotificationSignature({ ...payload, signature_key: signature }, {});
    } catch (error) {
      caught = error;
    }
    expect((caught as BillingError).code).toBe('configurationMissing');
    expect(String((caught as Error).message)).not.toContain(SERVER_KEY);
  });
});

describe('mapTransactionStatus', () => {
  it.each([
    [{ transaction_status: 'settlement' }, 'paid'],
    [{ transaction_status: 'capture', fraud_status: 'accept' }, 'paid'],
    [{ transaction_status: 'capture', fraud_status: 'challenge' }, 'failed'],
    [{ transaction_status: 'capture', fraud_status: 'deny' }, 'failed'],
    [{ transaction_status: 'capture' }, 'failed'],
    [{ transaction_status: 'pending' }, 'pending'],
    [{ transaction_status: 'authorize' }, 'pending'],
    [{ transaction_status: 'deny' }, 'failed'],
    [{ transaction_status: 'cancel' }, 'failed'],
    [{ transaction_status: 'expire' }, 'failed'],
    [{ transaction_status: 'failure' }, 'failed'],
    [{ transaction_status: 'something-new' }, 'pending'],
    [{}, 'pending'],
  ] as const)('maps %j to %s', (status, expected) => {
    expect(mapTransactionStatus(status)).toBe(expected);
  });
});
