import { NextResponse, type NextRequest } from 'next/server';
import {
  PRICE_VARIANT_COOKIE,
  PRICE_VARIANT_MAX_AGE,
  parsePriceVariant,
  pickPriceVariant,
} from '@/lib/waitlist/variant';

// Optimistic check only: a missing session cookie means "signed out", so the browser gets a real
// 307 instead of a mid-stream redirect. The (app) layout still validates the session against the
// database via requireUser(); a stale or forged cookie never grants access here.
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

/** E0-02 AC2: assign a sticky price variant on the landing page before it renders. */
function withPriceVariant(request: NextRequest) {
  if (parsePriceVariant(request.cookies.get(PRICE_VARIANT_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const variant = pickPriceVariant();
  // Also set it on the forwarded request so this very render sees the variant.
  request.cookies.set(PRICE_VARIANT_COOKIE, variant);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(PRICE_VARIANT_COOKIE, variant, {
    maxAge: PRICE_VARIANT_MAX_AGE,
    sameSite: 'lax',
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
  });
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/') return withPriceVariant(request);

  const hasSessionCookie = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSessionCookie) return NextResponse.next();

  const signInUrl = new URL('/masuk', request.url);
  signInUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
  return NextResponse.redirect(signInUrl);
}

// `/` gets the price-variant cookie; the rest is the signed-in app area (PRD §5.3 `(app)` routes).
// Other public pages (/masuk, legal, originals catalogue) stay out of this list.
export const config = {
  matcher: [
    '/',
    '/home/:path*',
    '/library/:path*',
    '/unbook/:path*',
    '/review/:path*',
    '/progress/:path*',
    '/journal/:path*',
    '/settings/:path*',
    '/onboarding/:path*',
    '/admin/:path*',
  ],
};
