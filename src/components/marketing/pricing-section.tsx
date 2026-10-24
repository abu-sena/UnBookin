import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';
import { formatIdr } from '@/lib/format';
import { getDisplayedPlans, type DisplayedPlan } from '@/lib/billing/pricing';
import { getPriceVariant } from '@/lib/waitlist/get-price-variant';

/** Map a plan family to its message keys for the feature bullets (PRD §7.5). */
type PlanFamily = 'free' | 'pro' | 'byok';

const FAMILY_BY_CODE: Record<DisplayedPlan['code'], PlanFamily> = {
  free: 'free',
  pro_monthly: 'pro',
  pro_yearly: 'pro',
  byok_monthly: 'byok',
  byok_yearly: 'byok',
};

/**
 * Pricing cards (E0-01 AC2, E11-01). Prices and savings labels come from the
 * `plans` + `price_variants` tables via getDisplayedPlans — never hard-coded.
 * Reading the variant cookie makes this section request-time, so it streams
 * inside Suspense (Cache Components).
 */
export async function PricingSection() {
  const [variant, t] = await Promise.all([getPriceVariant(), getTranslations('landing')]);
  const plans = await getDisplayedPlans(variant);
  const byCode = new Map(plans.map((plan) => [plan.code, plan]));

  const cards = [
    { family: 'free', monthly: byCode.get('free'), yearly: null },
    { family: 'pro', monthly: byCode.get('pro_monthly'), yearly: byCode.get('pro_yearly') },
    { family: 'byok', monthly: byCode.get('byok_monthly'), yearly: byCode.get('byok_yearly') },
  ] as const;

  return (
    <section aria-labelledby="harga-title" className="bg-surface-2/50 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <h2 id="harga-title" className="text-h2">
          {t('pricing.title')}
        </h2>
        <p className="text-muted-foreground mt-2">{t('pricing.subtitle')}</p>
        <div className="mt-6 grid gap-4 sm:mt-8 md:grid-cols-3">
          {cards.map(({ family, monthly, yearly }) => {
            if (!monthly) return null;
            return (
              <div
                key={family}
                className="bg-surface border-border rounded-[var(--radius-card)] border p-5"
              >
                <h3 className="text-h3">{monthly.name}</h3>
                <p className="mt-3 flex items-baseline gap-1">
                  <span
                    className="text-h2 font-bold"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatIdr(monthly.priceIdr)}
                  </span>
                  <span className="text-muted-foreground text-small">{t('pricing.perMonth')}</span>
                </p>
                {yearly && (
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <span
                      className="text-small font-semibold"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatIdr(yearly.priceIdr)}
                      <span className="text-muted-foreground font-medium">
                        {' '}
                        {t('pricing.perYear')}
                      </span>
                    </span>
                    {typeof yearly.savingsPct === 'number' && (
                      <span className="bg-primary-soft text-primary text-caption rounded-[var(--radius-full)] px-2 py-0.5 font-semibold">
                        {t('pricing.savings', { pct: yearly.savingsPct })}
                      </span>
                    )}
                  </p>
                )}
                <ul className="mt-4 space-y-2">
                  {([1, 2, 3] as const).map((n) => (
                    <li key={n} className="text-muted-foreground flex gap-2">
                      <span aria-hidden="true" className="text-primary">
                        ✓
                      </span>
                      <span>{t(`pricing.plans.${FAMILY_BY_CODE[monthly.code]}.bullet${n}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function PricingSkeleton() {
  return (
    <section aria-labelledby="harga-title" className="bg-surface-2/50 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <Skeleton className="h-7 w-32" />
        <div className="mt-6 grid gap-4 sm:mt-8 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-surface border-border space-y-3 rounded-[var(--radius-card)] border p-5"
            >
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PricingSectionSuspense() {
  return (
    <Suspense fallback={<PricingSkeleton />}>
      <PricingSection />
    </Suspense>
  );
}
