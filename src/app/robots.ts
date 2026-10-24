import type { MetadataRoute } from 'next';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://unbookin.com';

// `/dev` and `/api` are never public; the app-area routes mirror the matcher
// in `src/proxy.ts` (the landing `/` itself stays crawlable).
const DISALLOW = [
  '/dev',
  '/api',
  '/home',
  '/library',
  '/unbook',
  '/review',
  '/progress',
  '/journal',
  '/settings',
  '/onboarding',
  '/admin',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: DISALLOW },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
