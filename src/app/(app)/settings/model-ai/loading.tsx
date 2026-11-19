import { Skeleton } from '@/components/ui/skeleton';

/** Model AI skeleton: header, status card, connect button, and key form. */
export default function ModelAiLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-4 w-40" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
    </div>
  );
}