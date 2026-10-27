import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SourceProcessingView } from '@/components/sources/source-processing-view';
import { PageHeader } from '@/components/ui-kit/page-header';
import { getMySourceProgress } from '@/lib/sources/queries';

type UnbookPageProps = {
  // Next.js 16: `params` is async.
  params: Promise<{ unbookId: string }>;
};

export default async function UnbookPage({ params }: UnbookPageProps) {
  const { unbookId } = await params;
  const [t, progress] = await Promise.all([
    getTranslations('sources.progress'),
    getMySourceProgress(unbookId),
  ]);

  // getMySourceProgress rejects invalid ids and rows the user does not own.
  if (!progress) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('page.title')} description={t('page.description')} />
      <SourceProcessingView initialProgress={progress} />
    </div>
  );
}
