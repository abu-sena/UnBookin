import { PostHogAnalytics } from '@/lib/analytics/posthog-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';

const fontSans = Plus_Jakarta_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const [t, common] = await Promise.all([getTranslations('metadata'), getTranslations('common')]);
  // E0-01 AC4: absolute base URL for all URL-based metadata (OG, sitemap, robots).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://unbookin.com';

  return {
    metadataBase: new URL(appUrl),
    title: t('title'),
    description: t('description'),
    openGraph: {
      type: 'website',
      locale: 'id_ID',
      siteName: common('appName'),
      title: t('title'),
      description: t('description'),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
    },
  };
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" suppressHydrationWarning className={`${fontSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <ThemeProvider>
            <PostHogAnalytics>{children}</PostHogAnalytics>
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
