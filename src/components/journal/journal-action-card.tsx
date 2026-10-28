'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/layout/sheet';
import { updateActionStatus } from '@/lib/journal/actions';
import { DEFAULT_JOURNAL_TIME_ZONE, formatJournalDate } from './date-format';
import type { JournalActionView } from './view-types';

export { formatJournalDate };

export type JournalActionPatch = Partial<Pick<JournalActionView, 'status' | 'dueAt' | 'canReport'>>;

type JournalActionCardProps = {
  action: JournalActionView;
  nowIso: string;
  /** IANA zone from the profile; defaults to Asia/Jakarta. */
  timeZone?: string;
  onUpdated: (actionId: string, patch: JournalActionPatch) => void;
};

/**
 * E7-01: one journal action card. Planned actions can be reported, extended by
 * seven days, or skipped. Skipping asks for confirmation in a bottom sheet on
 * phones and a dialog on wide screens; neither operation ever penalises the
 * learner.
 */
export function JournalActionCard({
  action,
  nowIso,
  timeZone = DEFAULT_JOURNAL_TIME_ZONE,
  onUpdated,
}: JournalActionCardProps) {
  const t = useTranslations('journal');
  const tErrors = useTranslations('journal.errors');
  const router = useRouter();
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState(false);

  const overdue =
    action.status === 'planned' &&
    action.dueAt !== null &&
    new Date(action.dueAt).getTime() < new Date(nowIso).getTime();
  const busy = extending || skipping;

  async function extend() {
    if (busy) return;
    setExtending(true);
    setExtendError(null);
    try {
      const result = await updateActionStatus({ actionId: action.id, operation: 'extend' });
      if (!result.ok) {
        setExtendError(tErrors('extend'));
        return;
      }
      onUpdated(action.id, {
        status: result.status,
        dueAt: result.dueAt ? new Date(result.dueAt).toISOString() : null,
      });
      router.refresh();
    } catch {
      setExtendError(tErrors('extend'));
    } finally {
      setExtending(false);
    }
  }

  async function skip() {
    if (skipping) return;
    setSkipping(true);
    setSkipError(false);
    try {
      const result = await updateActionStatus({ actionId: action.id, operation: 'skip' });
      if (!result.ok) {
        setSkipError(true);
        return;
      }
      onUpdated(action.id, { status: 'skipped', canReport: false });
      setSkipOpen(false);
      router.refresh();
    } catch {
      setSkipError(true);
    } finally {
      setSkipping(false);
    }
  }

  return (
    <article className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="text-h3 min-w-0">
          <Link
            href={`/journal/${action.id}`}
            className="inline-flex min-h-11 items-center break-words hover:underline"
          >
            {action.title}
          </Link>
        </h3>
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
      </div>

      {action.status === 'planned' ? (
        <div className="flex flex-col gap-2">
          {action.canReport ? (
            <Button asChild className="w-full">
              <Link href={`/journal/${action.id}`}>{t('actions.report')}</Link>
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void extend()}
            >
              {extending ? t('actions.extending') : t('actions.extend')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setSkipError(false);
                setSkipOpen(true);
              }}
            >
              {t('actions.skip')}
            </Button>
          </div>
          {extendError ? (
            <p role="alert" className="text-danger text-small">
              {extendError}
            </p>
          ) : null}
        </div>
      ) : null}

      <Sheet
        open={skipOpen}
        onOpenChange={(open) => {
          if (!skipping) setSkipOpen(open);
        }}
        title={t('skipDialog.title')}
        description={t('skipDialog.description')}
      >
        <div className="flex flex-col gap-3 pb-2">
          {skipError ? (
            <p role="alert" className="text-danger text-small">
              {t('errors.skip')}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={skipping}
              onClick={() => setSkipOpen(false)}
            >
              {t('skipDialog.cancel')}
            </Button>
            <Button
              type="button"
              className="w-full"
              disabled={skipping}
              onClick={() => void skip()}
            >
              {skipping ? t('skipDialog.pending') : t('skipDialog.confirm')}
            </Button>
          </div>
        </div>
      </Sheet>
    </article>
  );
}
