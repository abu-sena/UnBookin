import { z } from 'zod';

export const emailSignInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

/** Only allow local paths, including when called directly as a Server Action. */
export function safeCallbackUrl(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u0020]/u.test(value)
  )
    return '/home';
  const url = new URL(value, 'https://unbookin.com');
  if (
    url.pathname === '/masuk' ||
    url.pathname.startsWith('/masuk/') ||
    url.pathname.startsWith('/api/auth')
  )
    return '/home';
  return `${url.pathname}${url.search}${url.hash}`;
}
