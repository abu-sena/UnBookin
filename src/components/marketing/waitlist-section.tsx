import { Suspense } from 'react';
import { and, asc, eq, ne } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';
import { WaitlistForm } from '@/components/marketing/waitlist-form';
import { db } from '@/db';
import { interests } from '@/db/schema';

export type LandingSearchParams = Promise<{ ref?: string | string[] }>;

/** `?ref=` is a visitor-supplied code; accept only a conservative shape. */
function extractReferralCode(ref: string | string[] | undefined): string | undefined {
  const value = Array.isArray(ref) ? ref[0] : ref;
  const trimmed = value?.trim();
  return trimmed && /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : undefined;
}

/**
 * Waitlist section (E0-02 AC1). The three opening interests come from the
 * `interests` table and `?ref=` from the query string — both request-time,
 * so this streams inside Suspense with a skeleton (Cache Components).
 */
export async function WaitlistSection({ searchParams }: { searchParams: LandingSearchParams }) {
  const [t, params] = await Promise.all([getTranslations('landing'), searchParams]);

  const rows = await db
    .select({ slug: interests.slug, name: interests.name })
    .from(interests)
    .where(and(eq(interests.isActive, true), ne(interests.slug, 'general')))
    .orderBy(asc(interests.sortOrder))
    .limit(3);

  return (
    <section id="daftar" aria-labelledby="daftar-title" className="scroll-mt-16 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[640px] px-4 sm:px-6 lg:px-8">
        <h2 id="daftar-title" className="text-h2">
          {t('waitlist.title')}
        </h2>
        <p className="text-muted-foreground mt-2">{t('waitlist.subtitle')}</p>
        <div className="mt-6">
          <WaitlistForm interests={rows} referralCode={extractReferralCode(params.ref)} />
        </div>
      </div>
    </section>
  );
}

export function WaitlistSkeleton() {
  return (
    <section id="daftar" aria-labelledby="daftar-title" className="scroll-mt-16 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[640px] px-4 sm:px-6 lg:px-8">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-5 w-full max-w-md" />
        <div className="bg-surface border-border mt-6 space-y-4 rounded-[var(--radius-card)] border p-5">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </section>
  );
}

export function WaitlistSectionSuspense({ searchParams }: { searchParams: LandingSearchParams }) {
  return (
    <Suspense fallback={<WaitlistSkeleton />}>
      <WaitlistSection searchParams={searchParams} />
    </Suspense>
  );
}
