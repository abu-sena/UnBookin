'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { SourceUploadContextState } from './source-action-adapter';

type UploadContextPanelProps = {
  state: SourceUploadContextState;
  onRetry: () => void;
};

export function UploadContextPanel({ state, onRetry }: UploadContextPanelProps) {
  const t = useTranslations('sources.upload');

  if (state.status === 'ready') {
    const { allowance } = state.data;
    const capacity = allowance.limits.unbooksPerMonth ?? allowance.limits.unbooksFairUse;
    const planTier = allowance.planCode.startsWith('byok')
      ? 'byok'
      : allowance.planCode.startsWith('pro')
        ? 'pro'
        : 'free';
    return (
      <div className="bg-surface-2 text-small flex flex-col gap-1 rounded-[var(--radius-card)] px-3 py-2">
        <p className="font-medium">{t('context.plan', { plan: t(`plans.${planTier}`) })}</p>
        <p className="text-text-muted">
          {t('context.remaining', { remaining: allowance.remaining, capacity })}
        </p>
        {allowance.remaining <= 0 ? (
          <p className="text-danger font-medium">{t('context.exhausted')}</p>
        ) : null}
        <p className="text-text-muted">
          {t('context.limits', {
            pages: allowance.limits.maxPagesPerSource,
            size: allowance.limits.maxFileMb,
          })}
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="border-danger/30 bg-danger/5 flex flex-col gap-2 rounded-[var(--radius-card)] border px-3 py-2">
        <p className="text-danger text-small" role="alert">
          {t('context.error')}
        </p>
        <Button type="button" variant="outline" className="min-h-11 self-start" onClick={onRetry}>
          {t('context.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-48" />
      <span className="sr-only">{t('context.loading')}</span>
    </div>
  );
}
