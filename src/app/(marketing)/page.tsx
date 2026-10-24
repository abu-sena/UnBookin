import { getTranslations } from 'next-intl/server';
import { Hero } from '@/components/marketing/hero';
import { CaraKerja } from '@/components/marketing/cara-kerja';
import { ModuleDemo } from '@/components/marketing/module-demo';
import { Gamification } from '@/components/marketing/gamification';
import { PricingSectionSuspense } from '@/components/marketing/pricing-section';
import {
  WaitlistSectionSuspense,
  type LandingSearchParams,
} from '@/components/marketing/waitlist-section';
import { FaqSection } from '@/components/marketing/faq-section';

/**
 * Public landing page (E0-01). Everything except pricing and the waitlist
 * form is static so the shell prerenders; those two sections read the price
 * variant cookie and `?ref=`/database and stream inside Suspense.
 */
export default async function LandingPage({ searchParams }: { searchParams: LandingSearchParams }) {
  const t = await getTranslations('landing');

  return (
    <>
      <Hero />
      <CaraKerja />
      <section aria-labelledby="demo-title" className="py-12 sm:py-16">
        <div className="mx-auto w-full max-w-[640px] px-4 sm:px-6 lg:px-8">
          <h2 id="demo-title" className="text-h2">
            {t('demo.title')}
          </h2>
          <p className="text-muted-foreground mt-2">{t('demo.subtitle')}</p>
          <div className="mt-6 sm:mt-8">
            <ModuleDemo />
          </div>
        </div>
      </section>
      <Gamification />
      <PricingSectionSuspense />
      <WaitlistSectionSuspense searchParams={searchParams} />
      <FaqSection />
    </>
  );
}
