'use client';

import { useTranslations } from 'next-intl';
import { BookOpenIcon, SearchXIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { LibraryCard } from '@/components/library/library-card';
import { useSourceUpload } from '@/components/sources/upload-trigger';
import type { LibraryItem } from '@/lib/library/types';

type LibraryResultsProps = {
  items: LibraryItem[];
  hasAnyUnbooks: boolean;
};

/**
 * E2-03 AC1: the library list plus the two distinct empty states. A genuinely
 * empty library offers one real CTA that opens the shared upload sheet through
 * the app shell's SourceUploadContext; without that context (isolated
 * previews) only the explanatory message renders — never an inert button. A
 * filtered search offers a working reset link.
 */
export function LibraryResults({ items, hasAnyUnbooks }: LibraryResultsProps) {
  const t = useTranslations('library');
  const upload = useSourceUpload();

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

  return (
    <EmptyState
      icon={BookOpenIcon}
      message={t('empty.message')}
      actionLabel={upload ? t('empty.action') : undefined}
      onAction={upload ? upload.openUpload : undefined}
    />
  );
}
