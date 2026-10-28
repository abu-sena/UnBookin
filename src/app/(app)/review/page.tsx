import { getTranslations } from 'next-intl/server';
import { ReviewSession } from '@/components/review/review-session';
import { PageHeader } from '@/components/ui-kit/page-header';
import { requireOnboardedUser } from '@/lib/auth/session';
import { countDueTomorrow, getReviewQueue } from '@/lib/learning/queries';

/** E6-01: the daily review queue (max 20 cards) and the end-of-session summary. */
export default async function ReviewPage() {
  const user = await requireOnboardedUser('/review');
  const [queue, dueTomorrow] = await Promise.all([
    getReviewQueue({ userId: user.id }),
    countDueTomorrow({ userId: user.id }),
  ]);
  const t = await getTranslations('pages');
  const tSession = await getTranslations('reviewSession');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('review.title')} description={tSession('pageDescription')} />
      <ReviewSession cards={queue.cards} dueTomorrow={dueTomorrow} />
    </div>
  );
}
