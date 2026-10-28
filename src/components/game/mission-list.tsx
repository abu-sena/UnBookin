import { useTranslations } from 'next-intl';
import type { GameSummaryMission } from '@/lib/game/queries';
import { MissionRing } from './mission-ring';

/** Weekly missions with ring, progress text, XP reward and completed label. */
export function MissionList({
  missions,
  limit,
}: {
  missions: GameSummaryMission[];
  limit?: number;
}) {
  const t = useTranslations('game.mission');
  const tMissions = useTranslations('game.missions');
  const visible = limit === undefined ? missions : missions.slice(0, limit);

  if (visible.length === 0) {
    return <p className="text-small text-text-muted">{tMissions('empty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {visible.map((mission) => {
        const now = Math.min(mission.progress, mission.target);
        return (
          <li key={mission.id} className="flex min-h-11 items-center gap-3">
            <MissionRing
              title={mission.title}
              progress={mission.progress}
              target={mission.target}
              completed={mission.completed}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-small font-semibold break-words">{mission.title}</span>
              <span className="text-caption text-text-muted tabular-nums">
                {t('progressText', { progress: now, target: mission.target })} ·{' '}
                {t('reward', { xp: mission.xpReward })}
                {mission.completed ? (
                  <>
                    {' · '}
                    <span className="text-level-competent-text font-semibold">
                      {t('completed')}
                    </span>
                  </>
                ) : null}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
