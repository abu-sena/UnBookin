import { Skeleton } from '@/components/ui/skeleton';

/** Loading shape for the Progres page (skeleton, never a spinner). */
export function ProgressSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="border-border bg-surface flex items-center gap-4 rounded-[var(--radius-card)] border p-5">
        <Skeleton className="size-[104px] rounded-[var(--radius-full)]" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-32 w-full rounded-[var(--radius-card)]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton key={key} className="h-32 w-full rounded-[var(--radius-card)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-16 w-full rounded-[var(--radius-card)]" />
        ))}
      </div>
    </div>
  );
}
