import { getTranslations } from 'next-intl/server';
import { ModulePathSkeleton } from '@/components/module/module-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default async function UnbookLoading() {
  const t = await getTranslations('reader.unbook');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t('loadingTitle')}</h1>
        <p className="text-body text-text-muted">{t('loadingDescription')}</p>
      </div>
      <div className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-4">
        <Skeleton className="h-5 w-40" aria-hidden="true" />
        <Skeleton className="h-2.5 w-full" aria-hidden="true" />
        <Skeleton className="h-3 w-14" aria-hidden="true" />
      </div>
      <ModulePathSkeleton />
    </div>
  );
}
