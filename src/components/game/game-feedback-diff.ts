import { DOMAIN_LEVELS, type DomainLevel } from '@/lib/game/domains';
import type { GameSummary } from '@/lib/game/queries';

export type DomainLevelUp = { id: string; name: string; level: DomainLevel };
export type BadgeEarned = { id: string; name: string };

export type GameDelta = {
  levelUp: { level: number; totalXp: number } | null;
  domainLevelUps: DomainLevelUp[];
  newBadges: BadgeEarned[];
  /** XP reward of weekly missions completed since the previous snapshot. */
  missionXp: number;
};

function levelIndex(level: DomainLevel): number {
  const index = DOMAIN_LEVELS.indexOf(level);
  return index < 0 ? 0 : index;
}

/**
 * Compare two server snapshots of the same user. Only real increases count,
 * so a reload, a lower number or an identical snapshot never celebrates.
 */
export function diffGameSummary(previous: GameSummary, next: GameSummary): GameDelta {
  const levelUp = next.level > previous.level ? { level: next.level, totalXp: next.totalXp } : null;

  const before = new Map(previous.domainLevels.map((domain) => [domain.id, domain.level]));
  const domainLevelUps: DomainLevelUp[] = [];
  for (const domain of next.domainLevels) {
    const old = before.get(domain.id) ?? 'novice';
    if (levelIndex(domain.level) > levelIndex(old)) {
      domainLevelUps.push({ id: domain.id, name: domain.name, level: domain.level });
    }
  }

  const earnedBefore = new Set(previous.badges.filter((badge) => badge.earned).map((b) => b.id));
  const newBadges = next.badges
    .filter((badge) => badge.earned && !earnedBefore.has(badge.id))
    .map((badge) => ({ id: badge.id, name: badge.name }));

  const doneBefore = new Set(previous.missions.filter((m) => m.completed).map((m) => m.id));
  const missionXp = next.missions
    .filter((mission) => mission.completed && !doneBefore.has(mission.id))
    .reduce((sum, mission) => sum + mission.xpReward, 0);

  return { levelUp, domainLevelUps, newBadges, missionXp };
}

export function hasCelebration(delta: GameDelta): boolean {
  return delta.levelUp !== null || delta.domainLevelUps.length > 0;
}
