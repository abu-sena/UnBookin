import { getTranslations } from 'next-intl/server';
import { HistoryIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { PageHeader } from '@/components/ui-kit/page-header';

export default async function ReviewPage() {
  const tPages = await getTranslations('pages');
  const tEmpty = await getTranslations('empty');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={tPages('review.title')} />
      <EmptyState
        icon={HistoryIcon}
        message={tEmpty('reviewMessage')}
        actionLabel={tEmpty('reviewAction')}
      />
    </div>
  );
}
