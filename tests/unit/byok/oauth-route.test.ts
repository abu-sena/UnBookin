import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  saveKey: vi.fn(),
  markVerified: vi.fn(),
  deleteKey: vi.fn(),
  testKey: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/byok/store', () => ({
  saveKey: mocks.saveKey,
  markVerified: mocks.markVerified,
  deleteKey: mocks.deleteKey,
}));
vi.mock('@/lib/byok/verify', () => ({ testKey: mocks.testKey }));

import { GET as callback } from '@/app/api/byok/callback/route';
import { GET as start } from '@/app/api/byok/start/route';
import { createCodeVerifier, createState } from '@/lib/byok/pkce';
import { createOAuthCookie } from '@/lib/byok/oauth-cookie';

const USER_A = randomUUID();
const USER_B = randomUUID();
const KEY = 'sk-or-v1-abcdef0123456789abcdef0123456789';

function cookieValue(setCookie: string | null): string {
  return (setCookie ?? '').split(';')[0] ?? '';
}

async function begin(userId = USER_A): Promise<{ state: string; cookie: string }> {
  mocks.getCurrentUser.mockResolvedValue({ id: userId });
  const response = await start(new Request('https://app.local/api/byok/start'));
  const location = new URL(response.headers.get('location') ?? '');
  const callbackUrl = new URL(location.searchParams.get('callback_url') ?? '');
  return {
    state: callbackUrl.searchParams.get('state') ?? '',
    cookie: cookieValue(response.headers.get('set-cookie')),
  };
}

function callbackRequest(state: string, cookie?: string, code = 'auth-code'): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new Request(
    `https://app.local/api/byok/callback?state=${encodeURIComponent(state)}&code=${code}`,
    { headers },
  );
}

function expectFailed(response: Response): void {
  expect(response.status).toBe(303);
  const location = new URL(response.headers.get('location') ?? '');
  expect(location.pathname).toBe('/settings/model-ai');
  expect(location.searchParams.get('byok')).toBe('failed');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.local');
  vi.stubEnv('OPENROUTER_AUTH_URL', 'https://auth.local/auth');
  vi.stubEnv('OPENROUTER_BASE_URL', 'https://gateway.local/api/v1');
  mocks.getCurrentUser.mockReset();
  mocks.saveKey.mockReset().mockResolvedValue({ last4: '6789' });
  mocks.markVerified.mockReset().mockResolvedValue(undefined);
  mocks.deleteKey.mockReset().mockResolvedValue(undefined);
  mocks.testKey.mockReset().mockResolvedValue('ok');
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /api/byok/start', () => {
  it('requires a session', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await start(new Request('https://app.local/api/byok/start'))).status).toBe(401);
  });

  it('redirects with S256 challenge and one short-lived user-bound cookie', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: USER_A });
    const response = await start(new Request('https://app.local/api/byok/start'));
    expect(response.status).toBe(302);

    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe('https://auth.local/auth');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    const callbackUrl = new URL(location.searchParams.get('callback_url') ?? '');
    expect(callbackUrl.pathname).toBe('/api/byok/callback');
    expect(callbackUrl.searchParams.get('state')).toBeTruthy();

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('ub_byok_oauth=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/api/byok');
    expect(setCookie).toContain('Max-Age=600');
    expect(setCookie).not.toContain(encodeURIComponent('sk-or'));
  });
});

describe('GET /api/byok/callback', () => {
  it('requires a session and clears the cookie', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await callback(callbackRequest('state'));
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('exchanges and stores the key, then redirects with only a status keyword', async () => {
    const { state, cookie } = await begin();
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ key: KEY }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await callback(callbackRequest(state, cookie));
    expect(response.status).toBe(303);
    const location = response.headers.get('location') ?? '';
    expect(new URL(location).searchParams.get('byok')).toBe('connected');
    expect(location).not.toContain(KEY);
    expect(location).not.toContain('auth-code');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');

    expect(mocks.saveKey).toHaveBeenCalledWith({ userId: USER_A }, KEY, 'oauth');
    expect(mocks.markVerified).toHaveBeenCalledWith({ userId: USER_A });
    const init = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe('https://gateway.local/api/v1/auth/keys');
    expect(JSON.parse(String(init.body))).toEqual({
      code: 'auth-code',
      code_verifier: expect.any(String),
      code_challenge_method: 'S256',
    });
  });

  it('deletes a key the provider then reports as invalid', async () => {
    const { state, cookie } = await begin();
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ key: KEY }), { status: 200 }));
    mocks.testKey.mockResolvedValue('invalid');

    const response = await callback(callbackRequest(state, cookie));
    expectFailed(response);
    expect(mocks.deleteKey).toHaveBeenCalledWith({ userId: USER_A });
  });

  it('fails without saving on a missing cookie', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: USER_A });
    const response = await callback(callbackRequest('state'));
    expectFailed(response);
    expect(mocks.saveKey).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('fails when the cookie belongs to another user', async () => {
    const { state, cookie } = await begin(USER_A);
    mocks.getCurrentUser.mockResolvedValue({ id: USER_B });
    const response = await callback(callbackRequest(state, cookie));
    expectFailed(response);
    expect(mocks.saveKey).not.toHaveBeenCalled();
  });

  it('fails when state does not match', async () => {
    const { cookie } = await begin();
    const response = await callback(callbackRequest('other-state', cookie));
    expectFailed(response);
    expect(mocks.saveKey).not.toHaveBeenCalled();
  });

  it('fails an expired cookie', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: USER_A });
    const state = createState();
    const expired = createOAuthCookie(
      { userId: USER_A, state, codeVerifier: createCodeVerifier() },
      Date.now() - 601_000,
    );
    const response = await callback(callbackRequest(state, cookieValue(expired.setCookie)));
    expectFailed(response);
    expect(mocks.saveKey).not.toHaveBeenCalled();
  });

  it('is single use at the client: the response clears the cookie', async () => {
    const { state, cookie } = await begin();
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ key: KEY }), { status: 200 }));
    const response = await callback(callbackRequest(state, cookie));
    expect(response.status).toBe(303);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');

    mocks.getCurrentUser.mockResolvedValue({ id: USER_A });
    const reused = await callback(callbackRequest(state));
    expectFailed(reused);
  });

  it('fails when the exchange request fails', async () => {
    const { state, cookie } = await begin();
    mocks.fetch.mockResolvedValue(new Response(null, { status: 500 }));
    const response = await callback(callbackRequest(state, cookie));
    expectFailed(response);
    expect(mocks.saveKey).not.toHaveBeenCalled();
  });
});
