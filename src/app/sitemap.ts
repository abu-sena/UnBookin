import type { MetadataRoute } from 'next';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://unbookin.com';

/** Landing + legal placeholders (E0-01 AC3). */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${appUrl}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${appUrl}/syarat`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${appUrl}/privasi`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${appUrl}/hak-cipta`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
