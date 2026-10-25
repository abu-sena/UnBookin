import { Skeleton } from '@/components/ui/skeleton';

/** Profile skeleton (PRD §12.8): avatar, stat tiles, badges and stats list. */
export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-8 w-32" />
      <div className="border-border bg-surface flex flex-col items-center gap-3 rounded-[var(--radius-card)] border p-6">
        <Skeleton className="size-20 rounded-[var(--radius-full)]" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-24 w-full rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="h-6 w-32" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton key={key} className="h-32 w-full rounded-[var(--radius-card)]" />
        ))}
      </div>
    </div>
  );
}
