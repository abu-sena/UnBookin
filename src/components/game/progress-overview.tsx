import Link from 'next/link';
import { AwardIcon, FlameIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BadgeCard } from '@/components/profile/badge-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui-kit/empty-state';
import type { GameSummary } from '@/lib/game/queries';
import { LevelSummary } from './level-overview';

const BADGE_LIMIT = 12;

/** Progress page top: level, streak, journal link and the badge grid. */
export function ProgressOverview({ summary }: { summary: GameSummary }) {
  const t = useTranslations('progress');
  const tStreak = useTranslations('game.streak');
  const badges = summary.badges.slice(0, BADGE_LIMIT);

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="progress-level-title"
        className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5"
      >
        <h2 id="progress-level-title" className="text-h2">
          {t('level.title')}
        </h2>
        <LevelSummary {...summary} />
      </section>

      <section
        aria-labelledby="progress-streak-title"
        className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5"
      >
        <h2 id="progress-streak-title" className="text-h2 flex items-center gap-2">
          <FlameIcon className="text-level-expert-text size-5" aria-hidden="true" />
          {tStreak('title')}
        </h2>
        <p className="text-h1 tabular-nums">{tStreak('days', { count: summary.currentStreak })}</p>
        <p className="text-small text-text-muted">
          {summary.activeToday ? tStreak('activeToday') : tStreak('idleToday')}
          {' · '}
          {tStreak('longest', { count: summary.longestStreak })}
          {' · '}
          {tStreak('freezes', { count: summary.streakFreezes })}
        </p>
        <Button asChild variant="outline" className="w-full sm:w-fit">
          <Link href="/journal">{t('streak.journalLink')}</Link>
        </Button>
      </section>

      <section aria-labelledby="progress-badges-title" className="flex flex-col gap-3">
        <h2 id="progress-badges-title" className="text-h2">
          {t('badges.title')}
        </h2>
        {badges.length === 0 ? (
          <EmptyState
            icon={AwardIcon}
            message={t('badges.empty')}
            actionLabel={t('skills.emptyAction')}
            actionHref="/settings/profil-belajar"
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {badges.map((badge) => (
              <BadgeCard
                key={badge.id}
                name={badge.name}
                description={badge.description}
                icon={badge.icon}
                tier={badge.tier}
                earned={badge.earned}
                lockedLabel={t('badges.locked')}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
