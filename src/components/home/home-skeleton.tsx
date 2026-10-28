import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Loading shell for the Home "Hari ini" card (PRD §12.8). */
export function HomeSkeleton({ className }: { className?: string }) {
  const t = useTranslations('home.today');

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('loadingAria')}
      className={cn('flex flex-col gap-3', className)}
    >
      <Skeleton className="h-7 w-32" />
      {Array.from({ length: 3 }, (_value, index) => (
        <div
          key={index}
          className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5"
        >
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
    </div>
  );
}
