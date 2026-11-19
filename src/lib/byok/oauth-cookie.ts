import 'server-only';
import { z } from 'zod';
import { isCodeVerifier } from '@/lib/byok/pkce';

/**
 * ONE short-lived httpOnly cookie carries both the PKCE verifier and `state`
 * (M8 plan). It is bound to the user id, expires after 10 minutes, and is
 * cleared on every callback, successful or not.
 */

export const OAUTH_COOKIE_NAME = 'ub_byok_oauth';
export const OAUTH_COOKIE_PATH = '/api/byok';
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

const payloadSchema = z.strictObject({
  userId: z.uuid(),
  state: z.string().min(20).max(256),
  codeVerifier: z.string().refine(isCodeVerifier),
  exp: z.number().int().positive(),
});

export type OAuthCookiePayload = z.infer<typeof payloadSchema>;

function encodePayload(payload: OAuthCookiePayload): string {
  return encodeURIComponent(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'));
}

function decodePayload(value: string): OAuthCookiePayload | null {
  try {
    const json = Buffer.from(decodeURIComponent(value), 'base64url').toString('utf8');
    const parsed = payloadSchema.safeParse(JSON.parse(json) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function cookieAttributes(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=${OAUTH_COOKIE_PATH}; HttpOnly; SameSite=Lax${secure}`;
}

export function createOAuthCookie(
  payload: Omit<OAuthCookiePayload, 'exp'>,
  now: number = Date.now(),
): { value: string; setCookie: string } {
  const full: OAuthCookiePayload = { ...payload, exp: now + OAUTH_COOKIE_MAX_AGE_SECONDS * 1000 };
  const value = encodePayload(full);
  return {
    value,
    setCookie: `${OAUTH_COOKIE_NAME}=${value}; Max-Age=${OAUTH_COOKIE_MAX_AGE_SECONDS}; ${cookieAttributes()}`,
  };
}

export function clearOAuthCookie(): string {
  return `${OAUTH_COOKIE_NAME}=; Max-Age=0; ${cookieAttributes()}`;
}

export function readOAuthCookie(
  request: Request,
  now: number = Date.now(),
): OAuthCookiePayload | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== OAUTH_COOKIE_NAME) continue;
    const payload = decodePayload(part.slice(separator + 1).trim());
    if (!payload || payload.exp <= now) return null;
    return payload;
  }
  return null;
}
