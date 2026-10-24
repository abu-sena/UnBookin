import { getTranslations } from 'next-intl/server';
import { SparklesIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { PageHeader } from '@/components/ui-kit/page-header';

export default async function HomePage() {
  const tPages = await getTranslations('pages');
  const tEmpty = await getTranslations('empty');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={tPages('home.title')} />
      <EmptyState
        icon={SparklesIcon}
        message={tEmpty('homeMessage')}
        actionLabel={tEmpty('homeAction')}
      />
    </div>
  );
}
