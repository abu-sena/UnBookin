import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand-logo';

/** Public marketing shell (E0-01): header with wordmark + CTA, footer legal. */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [marketing, legal] = await Promise.all([
    getTranslations('marketing'),
    getTranslations('legal'),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-border bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex min-h-11 shrink-0 items-center">
            <BrandLogo className="w-32 sm:w-40" sizes="(min-width: 640px) 160px, 128px" />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/masuk"
              className="text-small hover:bg-accent hover:text-accent-foreground duration-fast flex min-h-11 items-center rounded-[var(--radius-button)] px-2 font-medium transition-colors"
            >
              {marketing('header.signIn')}
            </Link>
            <Button asChild className="min-h-11 px-3">
              <Link href="/#daftar">{marketing('header.cta')}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-border border-t py-8">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <nav
            aria-label={marketing('footer.navLabel')}
            className="flex flex-wrap items-center gap-x-6 gap-y-2"
          >
            <Link
              href="/syarat"
              className="text-muted-foreground hover:text-text text-small inline-flex min-h-11 items-center"
            >
              {legal('syarat.title')}
            </Link>
            <Link
              href="/privasi"
              className="text-muted-foreground hover:text-text text-small inline-flex min-h-11 items-center"
            >
              {legal('privasi.title')}
            </Link>
            <Link
              href="/hak-cipta"
              className="text-muted-foreground hover:text-text text-small inline-flex min-h-11 items-center"
            >
              {legal('hakCipta.title')}
            </Link>
          </nav>
          <div className="flex shrink-0 flex-col gap-3">
            <Link href="/" className="inline-flex min-h-11 items-center self-start">
              <BrandLogo className="w-32" sizes="128px" loading="lazy" />
            </Link>
            <p className="text-muted-foreground text-small">{marketing('footer.rights')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
