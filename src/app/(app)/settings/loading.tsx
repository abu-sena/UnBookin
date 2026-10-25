import { Skeleton } from '@/components/ui/skeleton';

/** Settings hub skeleton: heading plus six list rows. */
export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="border-border bg-surface divide-border flex flex-col divide-y rounded-[var(--radius-card)] border">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <div key={key} className="flex min-h-14 items-center gap-3 px-4 py-3">
            <Skeleton className="size-10 rounded-[var(--radius-full)]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
