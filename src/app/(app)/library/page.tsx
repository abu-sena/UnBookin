import { getTranslations } from 'next-intl/server';
import { BookOpenIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { PageHeader } from '@/components/ui-kit/page-header';

export default async function LibraryPage() {
  const tPages = await getTranslations('pages');
  const tEmpty = await getTranslations('empty');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={tPages('library.title')} />
      <EmptyState
        icon={BookOpenIcon}
        message={tEmpty('libraryMessage')}
        actionLabel={tEmpty('libraryAction')}
      />
    </div>
  );
}
