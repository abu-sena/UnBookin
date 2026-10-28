import { getTranslations } from 'next-intl/server';
import { ReviewCardSkeleton } from '@/components/module/module-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default async function ReviewLoading() {
  const t = await getTranslations('pages');

  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('review.title')}</h1>
        <Skeleton className="h-4 w-3/4" aria-hidden="true" />
      </div>
      <Skeleton className="h-4 w-24" aria-hidden="true" />
      <ReviewCardSkeleton />
      <Skeleton className="h-11 w-full" aria-hidden="true" />
    </div>
  );
}
