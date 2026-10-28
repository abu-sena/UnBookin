import { describe, expect, it } from 'vitest';
import { levelForXp, levelProgress, MAX_LEVEL, xpForLevel } from '@/lib/game/levels';

describe('xpForLevel', () => {
  it('uses round(50 * n^1.6) for levels 1..30', () => {
    expect(xpForLevel(1)).toBe(50);
    expect(xpForLevel(2)).toBe(152);
    expect(xpForLevel(3)).toBe(290);
    expect(xpForLevel(30)).toBe(11_544);
    for (let n = 2; n <= MAX_LEVEL; n += 1) {
      expect(xpForLevel(n)).toBeGreaterThan(xpForLevel(n - 1));
    }
  });

  it('rejects levels outside the integer 1..30 range', () => {
    for (const n of [0, -1, 31, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => xpForLevel(n)).toThrow('invalidLevel');
    }
  });
});

describe('levelForXp', () => {
  it('starts everyone at level 1, including zero XP', () => {
    for (const xp of [0, 1, 49, 50, 151]) {
      expect(levelForXp(xp)).toBe(1);
    }
  });

  it('crosses each threshold exactly', () => {
    for (let n = 1; n <= MAX_LEVEL; n += 1) {
      const threshold = xpForLevel(n);
      expect(levelForXp(threshold)).toBe(n);
      if (n < MAX_LEVEL) expect(levelForXp(threshold - 1)).toBe(Math.max(1, n - 1));
    }
  });

  it('clamps at level 30 and rejects invalid XP', () => {
    expect(levelForXp(999_999)).toBe(30);
    for (const xp of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => levelForXp(xp)).toThrow('invalidXp');
    }
  });
});

describe('levelProgress', () => {
  it('uses zero as the start of level 1', () => {
    expect(levelProgress(0)).toEqual({
      level: 1,
      totalXp: 0,
      currentLevelXp: 0,
      nextLevelXp: 152,
      progress: 0,
    });
    expect(levelProgress(76)).toEqual({
      level: 1,
      totalXp: 76,
      currentLevelXp: 0,
      nextLevelXp: 152,
      progress: 0.5,
    });
  });

  it('reports the band for a mid level', () => {
    expect(levelProgress(200)).toEqual({
      level: 2,
      totalXp: 200,
      currentLevelXp: 152,
      nextLevelXp: 290,
      progress: 48 / 138,
    });
  });

  it('caps at level 30 with no next level and full progress', () => {
    const result = levelProgress(20_000);
    expect(result).toEqual({
      level: 30,
      totalXp: 20_000,
      currentLevelXp: 11_544,
      nextLevelXp: null,
      progress: 1,
    });
  });

  it('rejects invalid XP', () => {
    for (const xp of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => levelProgress(xp)).toThrow('invalidXp');
    }
  });
});
