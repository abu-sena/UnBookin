'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { XPToast } from '@/components/game/xp-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ReviewRatingCounts = { again: number; hard: number; good: number };

export type ReviewSummaryData = {
  reviewed: number;
  counts: ReviewRatingCounts;
  dueTomorrow: number;
  xpAwarded: boolean;
};

/** E6-01 AC4: end-of-session summary with per-rating counts and tomorrow's queue. */
export function ReviewSummary({ summary, className }: { summary: ReviewSummaryData; className?: string }) {
  const t = useTranslations('reviewSession.summary');

  return (
    <section
      aria-labelledby="review-summary-title"
      className={cn(
        'border-border bg-surface flex flex-col gap-5 rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <h2 id="review-summary-title" className="text-h2">
          {t('title')}
        </h2>
        <p className="text-body text-text-muted">{t('description', { count: summary.reviewed })}</p>
        {summary.xpAwarded ? <XPToast amount={10} /> : null}
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <div className="bg-surface-2 flex flex-col gap-1 rounded-[var(--radius-card)] p-3">
          <dt className="text-caption text-text-muted">{t('againLabel')}</dt>
          <dd className="text-h3 tabular-nums">{summary.counts.again}</dd>
        </div>
        <div className="bg-surface-2 flex flex-col gap-1 rounded-[var(--radius-card)] p-3">
          <dt className="text-caption text-text-muted">{t('hardLabel')}</dt>
          <dd className="text-h3 tabular-nums">{summary.counts.hard}</dd>
        </div>
        <div className="bg-surface-2 flex flex-col gap-1 rounded-[var(--radius-card)] p-3">
          <dt className="text-caption text-text-muted">{t('goodLabel')}</dt>
          <dd className="text-h3 tabular-nums">{summary.counts.good}</dd>
        </div>
      </dl>

      <p className="text-small text-text-muted">
        {summary.dueTomorrow > 0
          ? t('dueTomorrow', { count: summary.dueTomorrow })
          : t('noDueTomorrow')}
      </p>

      <Button asChild className="w-full">
        <Link href="/home">{t('done')}</Link>
      </Button>
    </section>
  );
}
