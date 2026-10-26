'use client';

import { useTranslations } from 'next-intl';
import { BookOpenIcon, SearchXIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { LibraryCard } from '@/components/library/library-card';
import type { LibraryItem } from '@/lib/library/types';

type LibraryResultsProps = {
  items: LibraryItem[];
  hasAnyUnbooks: boolean;
};

/**
 * E2-03 AC1: the library list plus the two distinct empty states. A genuinely
 * empty library explains what will appear here once upload exists; a filtered
 * search offers a working reset link. No upload/delete/retry placeholders are
 * rendered because those flows are not part of this increment.
 */
export function LibraryResults({ items, hasAnyUnbooks }: LibraryResultsProps) {
  const t = useTranslations('library');

  if (items.length > 0) {
    return (
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <LibraryCard key={item.id} item={item} />
        ))}
      </ul>
    );
  }

  if (hasAnyUnbooks) {
    return (
      <EmptyState
        icon={SearchXIcon}
        message={t('noMatches.message')}
        actionLabel={t('noMatches.reset')}
        actionHref="/library"
      />
    );
  }

  return <EmptyState icon={BookOpenIcon} message={t('empty.message')} />;
}
