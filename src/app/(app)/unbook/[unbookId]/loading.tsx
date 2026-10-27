import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';

export default async function UnbookLoading() {
  const t = await getTranslations('sources.progress');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('loading.title')}</h1>
        <p className="text-body text-text-muted">{t('loading.description')}</p>
      </div>
      <div className="bg-surface border-border flex w-full flex-col gap-3 rounded-[var(--radius-card)] border p-4">
        <Skeleton className="h-6 w-1/2" aria-hidden="true" />
        <Skeleton className="h-4 w-2/3" aria-hidden="true" />
        <Skeleton className="h-2.5 w-full" aria-hidden="true" />
        <Skeleton className="h-3 w-14" aria-hidden="true" />
      </div>
    </div>
  );
}
