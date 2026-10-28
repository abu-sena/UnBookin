import { Skeleton } from '@/components/ui/skeleton';

/** Loading shape for the journal list (PRD §12.8: skeleton, not a spinner). */
export function JournalSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-11 w-full" />
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5"
        >
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loading shape for one journal action detail. */
export function JournalDetailSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <Skeleton className="h-11 w-36" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}
