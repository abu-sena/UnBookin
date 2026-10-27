'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { PlanLimits } from '@/lib/billing/plan-limits';
import type { SourceErrorCode } from '@/lib/sources/types';
import { sourceCapacity, type ClientSourceError } from './upload-limits';

export type UploadRecovery =
  { kind: 'queue' } | { kind: 'finalized'; unbookId: string } | { kind: 'cleanupFailed' };

type UploadErrorNoticeProps = {
  code?: SourceErrorCode | null;
  localError?: ClientSourceError | null;
  limits: PlanLimits;
  remaining: number;
  recovery?: UploadRecovery | null;
  onRetryCleanup?: () => void;
};

export function UploadErrorNotice({
  code,
  localError,
  limits,
  remaining,
  recovery,
  onRetryCleanup,
}: UploadErrorNoticeProps) {
  const t = useTranslations('sources.upload');

  if (recovery) {
    return (
      <div
        role="alert"
        className="border-warning/40 bg-warning/10 flex flex-col gap-2 rounded-[var(--radius-card)] border p-3"
      >
        <p className="text-small">
          {recovery.kind === 'queue'
            ? t('recovery.queue')
            : recovery.kind === 'finalized'
              ? t('recovery.finalized')
              : t('recovery.cleanupFailed')}
        </p>
        {recovery.kind === 'queue' ? (
          <Button asChild variant="outline" className="min-h-11 self-start">
            <Link href="/library">{t('actions.openLibrary')}</Link>
          </Button>
        ) : null}
        {recovery.kind === 'finalized' ? (
          <Button asChild variant="outline" className="min-h-11 self-start">
            <Link href={`/unbook/${recovery.unbookId}`}>{t('actions.openUnbook')}</Link>
          </Button>
        ) : null}
        {recovery.kind === 'cleanupFailed' && onRetryCleanup ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 self-start"
            onClick={onRetryCleanup}
          >
            {t('actions.retryCleanup')}
          </Button>
        ) : null}
      </div>
    );
  }

  const resolved = localError ?? code;
  if (!resolved) return null;

  const capacity = sourceCapacity(limits);
  const message =
    resolved === 'fileTooLarge'
      ? t('errors.fileTooLarge', { limit: limits.maxFileMb })
      : resolved === 'pagesExceeded'
        ? t('errors.pagesExceeded', { limit: limits.maxPagesPerSource })
        : resolved === 'quotaExceeded'
          ? t('errors.quotaExceeded', { remaining, capacity })
          : t(`errors.${resolved}`);

  return (
    <p
      role="alert"
      className="border-danger/30 bg-danger/5 text-danger text-small rounded-[var(--radius-card)] border p-3"
    >
      {message}
    </p>
  );
}
