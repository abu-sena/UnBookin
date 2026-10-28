'use client';

import Link from 'next/link';
import { CalendarClockIcon, SparklesIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { Button } from '@/components/ui/button';
import { SourceUploadTrigger } from '@/components/sources/upload-trigger';

export type HomeAction = { id: string; title: string; dueAt: string | null };

export type HomeTodayProps = {
  hasAnyUnbooks: boolean;
  reviewDue: number;
  dueTomorrow: number;
  nextModule: { title: string; href: string } | null;
  actions: HomeAction[];
  /** Reference instant for the calm overdue label (ISO string). */
  nowIso: string;
};

export function formatHomeDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Home "Hari ini" card (end of Alur A, start of Alur B): review due now, the
 * next module, and up to three planned actions. Overdue actions stay calm:
 * only the date is restated, never a penalty.
 */
export function HomeToday({
  hasAnyUnbooks,
  reviewDue,
  dueTomorrow,
  nextModule,
  actions,
  nowIso,
}: HomeTodayProps) {
  const tEmpty = useTranslations('empty');
  const t = useTranslations('home.today');
  const now = new Date(nowIso).getTime();
  const visibleActions = actions.slice(0, 3);

  if (!hasAnyUnbooks) {
    return (
      <EmptyState
        icon={SparklesIcon}
        message={tEmpty('homeMessage')}
        action={
          <Button asChild>
            <SourceUploadTrigger>{tEmpty('homeAction')}</SourceUploadTrigger>
          </Button>
        }
      />
    );
  }

  return (
    <section aria-labelledby="home-today-title" className="flex flex-col gap-3">
      <h2 id="home-today-title" className="text-h2">
        {t('title')}
      </h2>

      <article className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
        <h3 className="text-h3">{t('reviewTitle')}</h3>
        {reviewDue > 0 ? (
          <>
            <p className="text-body text-text-muted">{t('reviewBody', { count: reviewDue })}</p>
            <Button asChild className="w-full">
              <Link href="/review">{t('startReview')}</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-body text-text-muted">{t('reviewEmpty')}</p>
            <p className="text-small text-text-muted">
              {dueTomorrow > 0
                ? t('reviewTomorrow', { count: dueTomorrow })
                : t('reviewTomorrowNone')}
            </p>
          </>
        )}
      </article>

      {nextModule ? (
        <article className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
          <h3 className="text-h3">{t('nextTitle')}</h3>
          <p className="text-body">{nextModule.title}</p>
          <Button asChild variant="outline" className="w-full">
            <Link href={nextModule.href}>{t('continue')}</Link>
          </Button>
        </article>
      ) : null}

      <article className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
        <h3 className="flex items-center gap-2 text-h3">
          <CalendarClockIcon className="text-primary size-5" aria-hidden="true" />
          {t('actionsTitle')}
        </h3>
        {visibleActions.length === 0 ? (
          <p className="text-body text-text-muted">{t('actionsEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visibleActions.map((action) => {
              const overdue = action.dueAt ? new Date(action.dueAt).getTime() < now : false;
              return (
                <li key={action.id} className="flex flex-col gap-1">
                  <span className="text-body">{action.title}</span>
                  <span className="text-small text-text-muted">
                    {action.dueAt
                      ? overdue
                        ? t('actionOverdue', { date: formatHomeDate(action.dueAt) })
                        : t('actionDue', { date: formatHomeDate(action.dueAt) })
                      : t('actionNoDue')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}
