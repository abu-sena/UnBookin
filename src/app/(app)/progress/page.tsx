import { getTranslations } from 'next-intl/server';
import { TrendingUpIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { PageHeader } from '@/components/ui-kit/page-header';

export default async function ProgressPage() {
  const tPages = await getTranslations('pages');
  const tEmpty = await getTranslations('empty');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={tPages('progress.title')} />
      <EmptyState
        icon={TrendingUpIcon}
        message={tEmpty('progressMessage')}
        actionLabel={tEmpty('progressAction')}
      />
    </div>
  );
}
