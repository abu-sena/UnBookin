import { NextResponse, type NextRequest } from 'next/server';

// Optimistic check only: a missing session cookie means "signed out", so the browser gets a real
// 307 instead of a mid-stream redirect. The (app) layout still validates the session against the
// database via requireUser(); a stale or forged cookie never grants access here.
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token'];

export function proxy(request: NextRequest) {
  const hasSessionCookie = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSessionCookie) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const signInUrl = new URL('/masuk', request.url);
  signInUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
  return NextResponse.redirect(signInUrl);
}

// Signed-in app area (PRD §5.3 `(app)` routes). Public pages (landing, /masuk, originals catalogue)
// stay out of this list.
export const config = {
  matcher: [
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
