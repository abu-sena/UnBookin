import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildCompletion,
  createProviderServer,
  isLoopback,
} from '../../e2e/support/action-provider.mjs';
import { actionFeedbackResultSchema } from '@/lib/journal/schemas';
import { assertLocalBaseUrl, assertLocalTestDatabase } from '../../e2e/support/guards';

type Started = { base: string; close: () => Promise<void> };

const open: Started[] = [];

async function start(mode: 'low' | 'high' | 'fail' = 'high'): Promise<Started> {
  const { server } = createProviderServer(mode);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const started: Started = {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
  open.push(started);
  return started;
}

afterEach(async () => {
  while (open.length) await open.pop()!.close();
});

async function complete(base: string): Promise<Response> {
  return fetch(`${base}/api/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'x', messages: [] }),
  });
}

describe('m6 e2e action provider', () => {
  it('serves /health', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('builds schema-valid completions: low=2, high=4', () => {
    for (const [mode, score] of [
      ['low', 2],
      ['high', 4],
    ] as const) {
      const completion = buildCompletion(mode);
      const content = JSON.parse(completion.choices[0]!.message.content) as unknown;
      const parsed = actionFeedbackResultSchema.parse(content);
      expect(parsed.qualityScore).toBe(score);
    }
  });

  it('switches modes through the loopback mode endpoint', async () => {
    const { base } = await start('high');
    expect((await complete(base)).status).toBe(200);

    const set = await fetch(`${base}/mode`, { method: 'POST', body: '{"mode":"low"}' });
    expect(set.status).toBe(200);
    const low = (await (await complete(base)).json()) as {
      choices: { message: { content: string } }[];
    };
    expect(JSON.parse(low.choices[0]!.message.content).qualityScore).toBe(2);

    await fetch(`${base}/mode`, { method: 'POST', body: '{"mode":"fail"}' });
    expect((await complete(base)).status).toBe(500);
    expect(await (await fetch(`${base}/mode`)).json()).toEqual({ mode: 'fail', requests: 3 });
  });

  it('rejects invalid and oversized mode requests', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/mode`, { method: 'POST', body: '{"mode":"x"}' })).status).toBe(
      400,
    );
    expect((await fetch(`${base}/mode`, { method: 'POST', body: 'nope' })).status).toBe(400);
    const big = await fetch(`${base}/mode`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'low', pad: 'a'.repeat(4_000) }),
    }).catch(() => null);
    expect(big === null || big.status === 413).toBe(true);
    expect(await (await fetch(`${base}/mode`)).json()).toEqual({ mode: 'high', requests: 0 });
  });

  it('only treats loopback addresses as loopback', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('10.0.0.5')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
});

describe('m6 e2e isolation guards', () => {
  const good = 'postgres://u:p@127.0.0.1:5432/unbookin_m3_test_20261027';

  it('accepts only the local test database', () => {
    expect(assertLocalTestDatabase(good)).toBe(good);
    expect(() => assertLocalTestDatabase(undefined)).toThrow();
    expect(() => assertLocalTestDatabase('postgres://u:p@db.example.com/x_test')).toThrow(/local/);
    expect(() => assertLocalTestDatabase('postgres://u:p@127.0.0.1:5432/unbookin')).toThrow(/test/);
    expect(() => assertLocalTestDatabase('postgres://u:p@localhost/x_test.neon.tech')).toThrow();
  });

  it('rejects the founder dev server port', () => {
    expect(() => assertLocalBaseUrl('http://localhost:3000')).toThrow();
    expect(() => assertLocalBaseUrl('https://localhost:3110')).toThrow();
    expect(() => assertLocalBaseUrl('http://example.com:3110')).toThrow();
    expect(assertLocalBaseUrl('http://localhost:3110')).toBe('http://localhost:3110');
  });
});
