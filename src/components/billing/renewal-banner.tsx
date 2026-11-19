'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarClockIcon } from 'lucide-react';

/** E11-02 AC3: calm in-app renewal reminder, shown only in the app shell and Langganan. */
export function RenewalBanner({ daysLeft }: { daysLeft: number }) {
  const t = useTranslations('billing');

  return (
    <div className="border-primary/30 bg-primary-soft text-text flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border p-4">
      <CalendarClockIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
      <p className="text-small min-w-0 flex-1 font-semibold">
        {t('renewalBanner.title', { days: daysLeft })}
      </p>
      <Link
        href="/settings/langganan"
        className="text-primary text-small inline-flex min-h-11 items-center font-semibold hover:underline"
      >
        {t('renewalBanner.cta')}
      </Link>
    </div>
  );
}