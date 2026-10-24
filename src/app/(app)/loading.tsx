import { Skeleton } from '@/components/ui/skeleton';

/** Loading skeleton matching the shape of a placeholder page (PRD §12.8). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-8 w-44" />
      <div className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="border-border bg-surface flex items-center gap-3 rounded-[var(--radius-card)] border p-4">
        <Skeleton className="size-12 rounded-[var(--radius-full)]" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}
