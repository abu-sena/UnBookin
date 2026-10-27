import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Loading shell for the module reader (PRD §12.8). */
export function ModulePageSkeleton({ className }: { className?: string }) {
  const t = useTranslations('module.skeletons');

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('moduleAria')}
      className={cn('flex flex-col gap-4', className)}
    >
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />
      <Skeleton className="h-11 w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <Skeleton className="h-56 w-full rounded-[var(--radius-card)]" />
    </div>
  );
}

/** Loading shell for the vertical module path (E4-01). */
export function ModulePathSkeleton({ className }: { className?: string }) {
  const t = useTranslations('module.skeletons');

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('pathAria')}
      className={cn('flex flex-col gap-3', className)}
    >
      {Array.from({ length: 4 }, (_value, index) => (
        <div key={index} className="flex items-start gap-3">
          <Skeleton className="size-12 shrink-0 rounded-[var(--radius-full)]" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loading shell for a review card (E6-01). */
export function ReviewCardSkeleton({ className }: { className?: string }) {
  const t = useTranslations('module.skeletons');

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('reviewAria')}
      className={cn(
        'border-border bg-surface flex min-h-44 flex-col gap-3 rounded-[var(--radius-card)] border p-5',
        className,
      )}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-6 w-11/12" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="mt-auto h-11 w-full" />
    </div>
  );
}
