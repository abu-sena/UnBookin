import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { GameSummary } from '@/lib/game/queries';
import { Button } from '@/components/ui/button';
import { LevelRing } from './level-ring';
import { MissionList } from './mission-list';

const numberFormat = new Intl.NumberFormat('id-ID');

type LevelSummaryProps = Pick<
  GameSummary,
  'level' | 'progress' | 'nextLevelXp' | 'totalXp'
>;

/** Ring plus total XP and the exact distance to the next level. */
export function LevelSummary({
  level,
  progress,
  nextLevelXp,
  totalXp,
}: LevelSummaryProps) {
  const t = useTranslations('game.level');
  return (
    <div className="flex min-w-0 items-center gap-4">
      <LevelRing level={level} progress={progress} nextLevelXp={nextLevelXp} size={104} />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-h2 tabular-nums">{t('totalXp', { xp: numberFormat.format(totalXp) })}</p>
        <p className="text-small text-text-muted">
          {nextLevelXp === null
            ? t('maxLevel')
            : t('toNext', {
                remaining: numberFormat.format(Math.max(0, nextLevelXp - totalXp)),
                next: level + 1,
              })}
        </p>
      </div>
    </div>
  );
}

/** Home block: level overview, three weekly missions, links to Progres and Jurnal. */
export function HomeGameOverview({ summary }: { summary: GameSummary }) {
  const t = useTranslations('game.homeOverview');
  const tMissions = useTranslations('game.missions');

  return (
    <section
      aria-labelledby="home-game-title"
      className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5"
    >
      <h2 id="home-game-title" className="text-h2">
        {t('title')}
      </h2>
      <LevelSummary {...summary} />
      <div className="flex flex-col gap-2">
        <h3 className="text-h3">{tMissions('title')}</h3>
        <MissionList missions={summary.missions} limit={3} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="w-full">
          <Link href="/progress">{t('viewProgress')}</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/journal">{t('viewJournal')}</Link>
        </Button>
      </div>
    </section>
  );
}

/** Shown on Home when the game summary query failed; links stay available. */
export function HomeGameUnavailable() {
  const t = useTranslations('game.homeOverview');
  return (
    <section className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
      <p className="text-small text-text-muted">{t('unavailable')}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="w-full">
          <Link href="/progress">{t('viewProgress')}</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/journal">{t('viewJournal')}</Link>
        </Button>
      </div>
    </section>
  );
}
