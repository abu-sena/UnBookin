import { getCurrentUser } from '@/lib/auth/session';
import { createOAuthCookie } from '@/lib/byok/oauth-cookie';
import { codeChallengeS256, createCodeVerifier, createState } from '@/lib/byok/pkce';

const DEFAULT_AUTH_URL = 'https://openrouter.ai/auth';

function appBaseUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
}

/**
 * GET /api/byok/start — begins OpenRouter OAuth PKCE (E12 AC1). The verifier
 * and `state` live in one short-lived httpOnly cookie bound to the signed-in
 * user; the redirect carries only the S256 challenge and callback URL.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const state = createState();
  const codeVerifier = createCodeVerifier();
  const codeChallenge = codeChallengeS256(codeVerifier);
  const { setCookie } = createOAuthCookie({ userId: user.id, state, codeVerifier });

  const callback = new URL('/api/byok/callback', appBaseUrl(request));
  callback.searchParams.set('state', state);

  let authBase = DEFAULT_AUTH_URL;
  const configured = process.env.OPENROUTER_AUTH_URL?.trim();
  if (configured) authBase = configured;
  const target = new URL(authBase);
  target.searchParams.set('callback_url', callback.toString());
  target.searchParams.set('code_challenge', codeChallenge);
  target.searchParams.set('code_challenge_method', 'S256');

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Set-Cookie': setCookie,
      'Cache-Control': 'private, no-store',
    },
  });
}
