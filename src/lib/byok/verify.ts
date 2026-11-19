import 'server-only';

/** Result of a safe, server-side key check. Never includes the key itself. */
export type KeyTestResult = 'ok' | 'invalid' | 'noCredit' | 'unavailable';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const TEST_TIMEOUT_MS = 10_000;
const OPENROUTER_KEY_PATTERN = /^sk-or-[A-Za-z0-9_-]{16,}$/;

/** Manual keys must look like an OpenRouter key before any network call. */
export function looksLikeOpenRouterKey(value: unknown): value is string {
  return typeof value === 'string' && OPENROUTER_KEY_PATTERN.test(value.trim());
}

/**
 * GET /key with the user's key. Any answer other than a known status is
 * `unavailable`; the key is only sent in the Authorization header and never
 * logged, echoed or put into an error.
 */
export async function testKey(plainKey: string): Promise<KeyTestResult> {
  if (!looksLikeOpenRouterKey(plainKey)) return 'invalid';
  const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL;

  try {
    const response = await fetch(`${baseUrl}/key`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${plainKey.trim()}` },
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    await response.body?.cancel();
    if (response.status === 200) return 'ok';
    if (response.status === 401 || response.status === 403) return 'invalid';
    if (response.status === 402) return 'noCredit';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}
