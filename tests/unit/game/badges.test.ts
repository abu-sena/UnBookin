import { describe, expect, it } from 'vitest';
import type { BadgeRule } from '@/lib/game/badge-rules';
import { eligibleBadges, qualifiesForBadge, type BadgeMetrics } from '@/lib/game/badges';
import { badgeSeeds } from '@/db/seed-data';

const baseMetrics: BadgeMetrics = {
  unbooks_completed: 0,
  modules_read: 0,
  actions_verified: 0,
  cards_reviewed: 0,
  interests_joined: 0,
  currentStreak: 0,
  longestStreak: 0,
  quizPerfect: false,
};

const metrics = (overrides: Partial<BadgeMetrics>): BadgeMetrics => ({
  ...baseMetrics,
  ...overrides,
});

describe('qualifiesForBadge', () => {
  it('evaluates all 12 seeded badge rules at their boundaries', () => {
    expect(badgeSeeds).toHaveLength(12);
    for (const seed of badgeSeeds) {
      const rule = seed.rule as BadgeRule;
      if (rule.kind === 'count') {
        expect(qualifiesForBadge(rule, metrics({ [rule.metric]: rule.gte - 1 }))).toBe(false);
        expect(qualifiesForBadge(rule, metrics({ [rule.metric]: rule.gte }))).toBe(true);
      } else if (rule.kind === 'streak') {
        expect(qualifiesForBadge(rule, metrics({ longestStreak: rule.gte - 1 }))).toBe(false);
        expect(qualifiesForBadge(rule, metrics({ longestStreak: rule.gte }))).toBe(true);
      } else {
        expect(qualifiesForBadge(rule, metrics({ quizPerfect: false }))).toBe(false);
        expect(qualifiesForBadge(rule, metrics({ quizPerfect: true }))).toBe(true);
      }
    }
  });

  it('awards streak badges from longestStreak even after the current streak resets', () => {
    expect(
      qualifiesForBadge(
        { kind: 'streak', gte: 7 },
        metrics({ currentStreak: 0, longestStreak: 7 }),
      ),
    ).toBe(true);
    expect(
      qualifiesForBadge(
        { kind: 'streak', gte: 7 },
        metrics({ currentStreak: 30, longestStreak: 6 }),
      ),
    ).toBe(false);
  });

  it('never awards unknown or malformed rules', () => {
    const rule = { kind: 'streak', gte: 7 } as BadgeRule;
    const metricsWithEverything = metrics({
      unbooks_completed: 100,
      modules_read: 100,
      actions_verified: 100,
      cards_reviewed: 100,
      interests_joined: 100,
      currentStreak: 100,
      longestStreak: 100,
      quizPerfect: true,
    });
    expect(qualifiesForBadge(rule, metricsWithEverything)).toBe(true);
    for (const invalid of [
      { kind: 'mystery', gte: 1 },
      { kind: 'count', metric: 'unknown_metric', gte: 1 },
      { kind: 'count', metric: 'modules_read', gte: 0 },
      { kind: 'count', metric: 'modules_read', gte: 1.5 },
      { kind: 'streak', gte: 0 },
      { kind: 'streak' },
      null,
      undefined,
    ]) {
      expect(qualifiesForBadge(invalid as never, metricsWithEverything)).toBe(false);
    }
  });
});

describe('eligibleBadges', () => {
  const catalog = badgeSeeds.map((seed) => ({
    id: seed.slug,
    rule: seed.rule as BadgeRule,
  }));

  it('returns only unearned badges that qualify, in catalog order', () => {
    const result = eligibleBadges(
      catalog,
      ['first-step', 'consistent-7'],
      metrics({
        unbooks_completed: 1,
        modules_read: 10,
        actions_verified: 1,
        longestStreak: 7,
        quizPerfect: true,
      }),
    );
    expect(result).toEqual(['diligent-reader', 'perfect', 'practitioner']);
    // Already-earned badges are never returned again.
    expect(result).not.toContain('consistent-7');
    expect(result).not.toContain('first-step');
  });

  it('deduplicates catalog ids and skips malformed entries', () => {
    const result = eligibleBadges(
      [
        { id: 'a', rule: { kind: 'quiz_perfect' } },
        { id: 'a', rule: { kind: 'quiz_perfect' } },
        { id: '', rule: { kind: 'quiz_perfect' } },
        { id: 'b', rule: { kind: 'streak', gte: 7 } },
      ],
      [],
      metrics({ quizPerfect: true, longestStreak: 6 }),
    );
    expect(result).toEqual(['a']);
  });

  it('returns nothing when metrics do not qualify', () => {
    expect(eligibleBadges(catalog, [], baseMetrics)).toEqual([]);
  });
});
