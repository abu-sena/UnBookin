'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import type { ConceptMapProps } from '@/components/module/concept-map';

function ConceptMapSkeleton() {
  const t = useTranslations('module.conceptMap');

  return (
    <div
      className="flex flex-col gap-2"
      role="status"
      aria-busy="true"
      aria-label={t('loadingAria')}
    >
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-[320px] w-full rounded-[var(--radius-card)] sm:h-[400px]" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

/**
 * Lazy entry point for the concept map. Dagre is only downloaded when the map
 * becomes visible, keeping it out of the initial route bundle (M5 plan #5).
 */
export const ConceptMapLazy = dynamic(
  () => import('@/components/module/concept-map').then((module) => module.ConceptMap),
  {
    ssr: false,
    loading: () => <ConceptMapSkeleton />,
  },
);

export type { ConceptMapProps };
