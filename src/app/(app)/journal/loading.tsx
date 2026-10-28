import { getTranslations } from 'next-intl/server';
import { JournalSkeleton } from '@/components/journal/journal-skeleton';

export default async function JournalLoading() {
  const t = await getTranslations('journal');

  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-live="polite"
      aria-label={t('loading.aria')}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('loading.title')}</h1>
        <p className="text-body text-text-muted">{t('loading.description')}</p>
      </div>
      <JournalSkeleton />
    </div>
  );
}
