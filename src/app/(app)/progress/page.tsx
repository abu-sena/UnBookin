import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { TrendingUpIcon } from 'lucide-react';
import { ProgressOverview } from '@/components/game/progress-overview';
import { ProgressSkeleton } from '@/components/game/progress-skeleton';
import { SkillTree } from '@/components/game/skill-tree';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { PageHeader } from '@/components/ui-kit/page-header';
import { requireOnboardedUser } from '@/lib/auth/session';
import { getGameSummary, getSkillTree } from '@/lib/game/queries';

/** E9-02: level, streak, badges and the skill tree per interest. */
export default async function ProgressPage() {
  const t = await getTranslations('progress');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('intro')} />
      <Suspense fallback={<ProgressSkeleton />}>
        <ProgressContent />
      </Suspense>
    </div>
  );
}

async function ProgressContent() {
  const user = await requireOnboardedUser('/progress');
  const identity = { userId: user.id };
  const [summary, tree, t] = await Promise.all([
    getGameSummary(identity),
    getSkillTree(identity),
    getTranslations('progress'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ProgressOverview summary={summary} />
      <section aria-labelledby="progress-skills-title" className="flex flex-col gap-3">
        <h2 id="progress-skills-title" className="text-h2">
          {t('skills.title')}
        </h2>
        {tree.interests.length === 0 ? (
          <EmptyState
            icon={TrendingUpIcon}
            message={t('skills.emptyMessage')}
            actionLabel={t('skills.emptyAction')}
            actionHref="/settings/profil-belajar"
          />
        ) : (
          <SkillTree interests={tree.interests} />
        )}
      </section>
    </div>
  );
}
