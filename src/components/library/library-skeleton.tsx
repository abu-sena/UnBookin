import { Skeleton } from '@/components/ui/skeleton';

/** Loading shape for the library controls and cards (PRD §12.8, skeleton not spinner). */
export function LibrarySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-11 w-full" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((key) => (
          <div
            key={key}
            className="border-border bg-surface flex gap-3 rounded-[var(--radius-card)] border p-3"
          >
            <Skeleton className="h-[88px] w-16 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
