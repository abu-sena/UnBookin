import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { JournalDetail } from '@/components/journal/journal-detail';
import { JournalDetailSkeleton } from '@/components/journal/journal-skeleton';
import { toJournalActionView } from '@/components/journal/view-types';
import { requireUser } from '@/lib/auth/session';
import { JournalError } from '@/lib/journal/errors';
import { getJournalAction } from '@/lib/journal/queries';
import type { JournalAction } from '@/lib/journal/types';

type JournalDetailPageProps = {
  // Next.js 16: `params` is async.
  params: Promise<{ actionId: string }>;
};

/** E7-02: one action, its reports, and the report/revision form. */
export default async function JournalDetailPage({ params }: JournalDetailPageProps) {
  const { actionId } = await params;

  return (
    <Suspense fallback={<JournalDetailSkeleton />}>
      <JournalDetailContent actionId={actionId} />
    </Suspense>
  );
}

async function JournalDetailContent({ actionId }: { actionId: string }) {
  const user = await requireUser(`/journal/${actionId}`);

  let action: JournalAction;
  try {
    action = await getJournalAction({ userId: user.id }, { actionId });
  } catch (error) {
    if (
      error instanceof JournalError &&
      (error.code === 'notFound' || error.code === 'invalidInput')
    ) {
      notFound();
    }
    throw error;
  }

  return <JournalDetail action={toJournalActionView(action)} nowIso={new Date().toISOString()} />;
}
