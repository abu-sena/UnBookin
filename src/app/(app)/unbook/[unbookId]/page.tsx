import { notFound } from 'next/navigation';
import { SourceDeleteButton } from '@/components/sources/source-delete-button';
import { UnbookPageContent } from '@/components/reader/unbook-page-content';
import { requireUser } from '@/lib/auth/session';
import { LearningError } from '@/lib/learning/errors';
import { getUnbookPath, type UnbookPath } from '@/lib/learning/queries';
import { getMySourceProgress } from '@/lib/sources/queries';

type UnbookPageProps = {
  // Next.js 16: `params` is async.
  params: Promise<{ unbookId: string }>;
};

export default async function UnbookPage({ params }: UnbookPageProps) {
  const { unbookId } = await params;
  const progress = await getMySourceProgress(unbookId);

  // getMySourceProgress rejects invalid ids and rows the user does not own.
  if (!progress) notFound();

  let path: UnbookPath | null = null;
  if (progress.unbookStatus === 'ready') {
    const user = await requireUser(`/unbook/${unbookId}`);
    try {
      path = await getUnbookPath({ userId: user.id }, { unbookId });
    } catch (error) {
      if (error instanceof LearningError) {
        if (error.code === 'notFound' || error.code === 'invalidInput') notFound();
        // A race during the ready transition keeps the processing view.
      } else {
        throw error;
      }
    }
  }

  return (
    <UnbookPageContent
      progress={progress}
      path={path}
      deleteAction={
        <SourceDeleteButton unbookId={progress.unbookId} title={progress.title} returnToLibrary />
      }
    />
  );
}
