import { Skeleton } from '@/components/ui/skeleton';

/** Langganan skeleton: header, current plan card, plan grid, and history rows. */
export default function LanggananLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-4 w-40" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-28 w-full rounded-[var(--radius-card)]" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-40 w-full rounded-[var(--radius-card)]" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}