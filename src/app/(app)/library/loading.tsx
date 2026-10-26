import { LibrarySkeleton } from '@/components/library/library-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function LibraryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-28" aria-hidden="true" />
        <Skeleton className="h-5 w-3/4" aria-hidden="true" />
      </div>
      <LibrarySkeleton />
    </div>
  );
}
