/** E8-02: player levels 1-30 with cumulative XP thresholds. */

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 30;

export type LevelProgress = {
  level: number;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  /** Fraction of the current level's XP band, in [0, 1]. */
  progress: number;
};

function assertXp(xp: number): void {
  if (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0) {
    throw new Error('invalidXp');
  }
}

/**
 * Cumulative XP needed to reach level `n`, `round(50 * n^1.6)`.
 * Level 1 is the starting level; a fresh account at 0 XP is already level 1.
 */
export function xpForLevel(n: number): number {
  if (!Number.isInteger(n) || n < MIN_LEVEL || n > MAX_LEVEL) {
    throw new Error('invalidLevel');
  }
  return Math.round(50 * n ** 1.6);
}

/** Highest level whose cumulative threshold is met, clamped to 1..30. */
export function levelForXp(xp: number): number {
  assertXp(xp);
  let level = MIN_LEVEL;
  for (let n = MIN_LEVEL; n <= MAX_LEVEL; n += 1) {
    if (xp >= xpForLevel(n)) {
      level = n;
    } else {
      break;
    }
  }
  return level;
}

/**
 * Level plus the XP band around it. Level 1 starts at 0 XP even though its
 * nominal threshold is 50; the cap at 30 has no next level and is always full.
 */
export function levelProgress(xp: number): LevelProgress {
  assertXp(xp);
  const level = levelForXp(xp);
  const currentLevelXp = level === MIN_LEVEL ? 0 : xpForLevel(level);
  const nextLevelXp = level === MAX_LEVEL ? null : xpForLevel(level + 1);
  const progress =
    nextLevelXp === null
      ? 1
      : Math.min(1, Math.max(0, (xp - currentLevelXp) / (nextLevelXp - currentLevelXp)));
  return { level, totalXp: xp, currentLevelXp, nextLevelXp, progress };
}
