'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeftIcon, CalendarClockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_JOURNAL_TIME_ZONE, formatJournalDate } from './date-format';
import { JournalReportHistory } from './journal-report-history';
import { JournalReportForm } from './journal-report-form';
import type { JournalActionView } from './view-types';

type JournalDetailProps = {
  action: JournalActionView;
  nowIso: string;
  timeZone?: string;
};

/** E7-02: one action, its persisted reports, and the report/revision form. */
export function JournalDetail({
  action,
  nowIso,
  timeZone = DEFAULT_JOURNAL_TIME_ZONE,
}: JournalDetailProps) {
  const t = useTranslations('journal');
  const tDetail = useTranslations('journal.detail');
  const tForm = useTranslations('journal.form');

  const overdue =
    action.status === 'planned' &&
    action.dueAt !== null &&
    new Date(action.dueAt).getTime() < new Date(nowIso).getTime();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/journal"
        className="text-small text-text-muted hover:text-text inline-flex min-h-11 w-fit items-center gap-2"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        {tDetail('back')}
      </Link>

      <header className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t(`status.${action.status}`)}</Badge>
        </div>
        <h1 className="text-h1 break-words">{action.title}</h1>
        <p className="text-small text-text-muted flex min-w-0 flex-wrap gap-x-1">
          <span>{t('moduleLabel')}</span>
          <Link
            href={`/unbook/${action.unbookId}/module/${action.moduleId}`}
            className="text-text inline-flex min-h-11 items-center break-words hover:underline"
          >
            {action.moduleTitle}
          </Link>
        </p>
        <p className="text-small text-text-muted flex flex-wrap items-center gap-2">
          <CalendarClockIcon className="size-4 shrink-0" aria-hidden="true" />
          <span>
            {action.dueAt
              ? t('due', { date: formatJournalDate(action.dueAt, timeZone) })
              : t('noDue')}
          </span>
          {overdue ? <span className="text-warning font-semibold">{t('overdue')}</span> : null}
        </p>
        {overdue ? <p className="text-small text-text-muted">{t('overdueNote')}</p> : null}
        {action.status === 'done' ? (
          <p className="text-small text-text-muted">{tDetail('doneNote')}</p>
        ) : null}
        {action.status === 'skipped' ? (
          <p className="text-small text-text-muted">{tDetail('skippedNote')}</p>
        ) : null}
      </header>

      <JournalReportHistory reports={action.reports} timeZone={timeZone} />

      {action.status === 'planned' && !action.canReport ? (
        <section className="border-border bg-surface flex flex-col gap-2 rounded-[var(--radius-card)] border p-5">
          <h2 className="text-h2">{tForm('exhaustedTitle')}</h2>
          <p className="text-body text-text-muted">{tForm('exhaustedBody')}</p>
        </section>
      ) : null}

      <JournalReportForm
        actionId={action.id}
        canReport={action.canReport}
        reports={action.reports}
      />
    </div>
  );
}
