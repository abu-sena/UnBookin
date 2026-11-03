import { getTranslations } from 'next-intl/server';
import { ProgressSkeleton } from '@/components/game/progress-skeleton';

export default async function ProgressLoading() {
  const t = await getTranslations('progress');

  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-label={t('loading.aria')}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-body text-text-muted">{t('intro')}</p>
      </div>
      <ProgressSkeleton />
    </div>
  );
}
