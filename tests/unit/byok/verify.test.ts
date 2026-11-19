import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('server-only', () => ({}));

import { looksLikeOpenRouterKey, testKey } from '@/lib/byok/verify';

const KEY = 'sk-or-v1-abcdef0123456789abcdef0123456789';

beforeEach(() => {
  vi.stubEnv('OPENROUTER_BASE_URL', 'https://gateway.local/api/v1');
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BYOK key verification', () => {
  it('rejects keys that do not look like OpenRouter keys before any network call', async () => {
    expect(looksLikeOpenRouterKey('not-a-key')).toBe(false);
    expect(looksLikeOpenRouterKey('sk-or-short')).toBe(false);
    expect(await testKey('not-a-key')).toBe('invalid');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [200, 'ok'],
    [401, 'invalid'],
    [403, 'invalid'],
    [402, 'noCredit'],
    [429, 'unavailable'],
    [503, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, expected) => {
    mocks.fetch.mockResolvedValue(new Response(null, { status }));
    expect(await testKey(KEY)).toBe(expected);
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe('https://gateway.local/api/v1/key');
    const init = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it('never echoes the key on failure or network error', async () => {
    mocks.fetch.mockRejectedValue(new Error(`boom ${KEY}`));
    const result = await testKey(KEY);
    expect(result).toBe('unavailable');
    expect(String(result)).not.toContain(KEY);
  });
});
