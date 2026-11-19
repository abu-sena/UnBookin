import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { clearOAuthCookie, readOAuthCookie } from '@/lib/byok/oauth-cookie';
import { deleteKey, markVerified, saveKey } from '@/lib/byok/store';
import { testKey } from '@/lib/byok/verify';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const EXCHANGE_TIMEOUT_MS = 10_000;
const MAX_CODE_LENGTH = 2048;

const exchangeSchema = z.object({ key: z.string().trim().min(1) });

function appBaseUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
}

/** Only a status keyword ever lands in the URL; never the key or the code. */
function redirectToSettings(request: Request, outcome: 'connected' | 'failed'): Response {
  const url = new URL('/settings/model-ai', appBaseUrl(request));
  url.searchParams.set('byok', outcome);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString(),
      'Set-Cookie': clearOAuthCookie(),
      'Cache-Control': 'private, no-store',
    },
  });
}

async function exchangeCode(code: string, codeVerifier: string): Promise<string | null> {
  const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL;
  try {
    const response = await fetch(`${baseUrl}/auth/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        code_challenge_method: 'S256',
      }),
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const parsed = exchangeSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.key : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/byok/callback — verifies `state`, the user-bound cookie and its
 * expiry (single use, cleared every time), exchanges the code server-side,
 * stores the encrypted key and redirects with a status keyword only.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'Set-Cookie': clearOAuthCookie(), 'Cache-Control': 'no-store' } },
    );
  }

  const cookie = readOAuthCookie(request);
  if (!cookie || cookie.userId !== user.id) return redirectToSettings(request, 'failed');

  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || state !== cookie.state) return redirectToSettings(request, 'failed');
  if (!code || code.length > MAX_CODE_LENGTH) return redirectToSettings(request, 'failed');

  const plainKey = await exchangeCode(code, cookie.codeVerifier);
  if (!plainKey) return redirectToSettings(request, 'failed');

  const identity = { userId: user.id };
  try {
    await saveKey(identity, plainKey, 'oauth');
    const result = await testKey(plainKey);
    if (result === 'invalid') {
      await deleteKey(identity);
      return redirectToSettings(request, 'failed');
    }
    if (result === 'ok') await markVerified(identity);
    return redirectToSettings(request, 'connected');
  } catch {
    return redirectToSettings(request, 'failed');
  }
}
