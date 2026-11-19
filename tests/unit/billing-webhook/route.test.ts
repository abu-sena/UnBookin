import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/billing/notifications', () => ({
  processMidtransNotification: vi.fn(async () => ({ status: 200 })),
}));

import * as route from '@/app/api/webhooks/midtrans/route';
import { processMidtransNotification } from '@/lib/billing/notifications';

const process = vi.mocked(processMidtransNotification);
const URL_VALUE = 'http://localhost/api/webhooks/midtrans';

const payload = {
  order_id: 'UB-m8test-order1',
  status_code: '200',
  gross_amount: '59000.00',
  signature_key: 'abc',
  transaction_status: 'settlement',
};

beforeEach(() => {
  process.mockClear();
  process.mockResolvedValue({ status: 200 });
});

describe('/api/webhooks/midtrans route', () => {
  it('exports POST only', () => {
    expect(typeof route.POST).toBe('function');
    expect('GET' in route).toBe(false);
    expect('PUT' in route).toBe(false);
    expect('PATCH' in route).toBe(false);
    expect('DELETE' in route).toBe(false);
  });

  it('accepts a JSON body and returns the processor status with no-store', async () => {
    process.mockResolvedValueOnce({ status: 401 });
    const response = await route.POST(
      new Request(URL_VALUE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );

    expect(process).toHaveBeenCalledWith(payload);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ status: 401 });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('accepts a form-encoded body', async () => {
    const form = new URLSearchParams(payload).toString();
    const response = await route.POST(
      new Request(URL_VALUE, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      }),
    );

    expect(process).toHaveBeenCalledWith(payload);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects a declared body larger than 16 KB', async () => {
    const response = await route.POST(
      new Request(URL_VALUE, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(17 * 1024),
        },
        body: 'x'.repeat(17 * 1024),
      }),
    );

    expect(response.status).toBe(413);
    expect(process).not.toHaveBeenCalled();
  });

  it('rejects a streamed body larger than 16 KB even without a large content-length', async () => {
    const response = await route.POST(
      new Request(URL_VALUE, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '1' },
        body: 'x'.repeat(17 * 1024),
      }),
    );

    expect(response.status).toBe(413);
    expect(process).not.toHaveBeenCalled();
  });

  it('passes an unparseable JSON body through as a 400', async () => {
    process.mockResolvedValueOnce({ status: 400 });
    const response = await route.POST(
      new Request(URL_VALUE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not-json',
      }),
    );

    expect(process).toHaveBeenCalledWith(undefined);
    expect(response.status).toBe(400);
  });
});