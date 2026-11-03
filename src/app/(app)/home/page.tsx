import { getTranslations } from 'next-intl/server';
import { HomeGameOverview, HomeGameUnavailable } from '@/components/game/level-overview';
import { HomeToday } from '@/components/home/home-today';
import { PageHeader } from '@/components/ui-kit/page-header';
import { requireOnboardedUser } from '@/lib/auth/session';
import { getGameSummary, type GameSummary } from '@/lib/game/queries';
import { LearningError } from '@/lib/learning/errors';
import { countDueCards, getTodaySummary, getUnbookPath } from '@/lib/learning/queries';
import { getMyLibrary } from '@/lib/library/query';

async function loadGameSummary(userId: string): Promise<GameSummary | null> {
  try {
    return await getGameSummary({ userId });
  } catch {
    // Statistics must never break Home.
    return null;
  }
}

/** Home: the "Hari ini" card at the end of Alur A and the start of Alur B. */
export default async function HomePage() {
  const user = await requireOnboardedUser('/home');
  const t = await getTranslations('pages');
  const [library, gameSummary] = await Promise.all([
    getMyLibrary({ q: '', interest: '', status: '' }),
    loadGameSummary(user.id),
  ]);
  const nowIso = new Date().toISOString();
  const gameBlock = gameSummary ? (
    <HomeGameOverview summary={gameSummary} />
  ) : (
    <HomeGameUnavailable />
  );

  if (!library.hasAnyUnbooks) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('home.title')} />
        <HomeToday
          hasAnyUnbooks={false}
          reviewDue={0}
          dueTomorrow={0}
          nextModule={null}
          actions={[]}
          nowIso={nowIso}
        />
        {gameBlock}
      </div>
    );
  }

  const [summary, reviewDue] = await Promise.all([
    getTodaySummary({ userId: user.id }),
    countDueCards({ userId: user.id }),
  ]);

  const oldestIncomplete = [...library.items]
    .reverse()
    .find((item) => item.status === 'ready' && item.modulesRead < item.moduleCount);

  let nextModule: { title: string; href: string } | null = null;
  if (oldestIncomplete) {
    try {
      const path = await getUnbookPath({ userId: user.id }, { unbookId: oldestIncomplete.id });
      const node = path.modules.find((item) => item.moduleId === path.continueModuleId);
      if (node) {
        nextModule = {
          title: node.title,
          href: `/unbook/${path.unbookId}/module/${node.moduleId}`,
        };
      }
    } catch (error) {
      if (!(error instanceof LearningError)) throw error;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('home.title')} />
      <HomeToday
        hasAnyUnbooks
        reviewDue={reviewDue}
        dueTomorrow={summary.dueTomorrow}
        nextModule={nextModule}
        actions={summary.activeActions.map((action) => ({
          id: action.id,
          title: action.title,
          dueAt: action.dueAt ? action.dueAt.toISOString() : null,
        }))}
        nowIso={nowIso}
      />
      {gameBlock}
    </div>
  );
}
