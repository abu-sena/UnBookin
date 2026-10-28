import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { JournalSkeleton } from '@/components/journal/journal-skeleton';
import { JournalView } from '@/components/journal/journal-view';
import { toJournalActionView } from '@/components/journal/view-types';
import { PageHeader } from '@/components/ui-kit/page-header';
import { requireUser } from '@/lib/auth/session';
import { getJournalTimeZone, listJournal } from '@/lib/journal/queries';

/** E7-01: the learner's journal, grouped into active, done and skipped tabs. */
export default async function JournalPage() {
  const t = await getTranslations('journal');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense fallback={<JournalSkeleton />}>
        <JournalContent />
      </Suspense>
    </div>
  );
}

async function JournalContent() {
  const user = await requireUser('/journal');
  const identity = { userId: user.id };
  const [actions, timeZone] = await Promise.all([
    listJournal(identity),
    getJournalTimeZone(identity),
  ]);
  const nowIso = new Date().toISOString();

  return (
    <JournalView actions={actions.map(toJournalActionView)} nowIso={nowIso} timeZone={timeZone} />
  );
}
