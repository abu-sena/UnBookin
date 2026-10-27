import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';

export default async function QuizLoading() {
  const t = await getTranslations('quizFlow.loading');

  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-label={t('aria')}>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-body text-text-muted">{t('description')}</p>
      </div>
      <Skeleton className="h-2.5 w-full" aria-hidden="true" />
      <Skeleton className="h-6 w-4/5" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" aria-hidden="true" />
        <Skeleton className="h-12 w-full" aria-hidden="true" />
        <Skeleton className="h-12 w-full" aria-hidden="true" />
      </div>
    </div>
  );
}
