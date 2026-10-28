/** E8-05: evaluate badge rules against aggregated metrics. */

import { BadgeRule } from './badge-rules';

export type BadgeMetrics = {
  unbooks_completed: number;
  modules_read: number;
  actions_verified: number;
  cards_reviewed: number;
  interests_joined: number;
  currentStreak: number;
  longestStreak: number;
  quizPerfect: boolean;
};

export type BadgeCatalogEntry = { id: string; rule: BadgeRule };

function isCountable(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Streak badges use `longestStreak`, not `currentStreak`, so a badge earned in
 * the past stays earned after the current streak resets.
 */
export function qualifiesForBadge(rule: BadgeRule, metrics: BadgeMetrics): boolean {
  const parsed = BadgeRule.safeParse(rule);
  if (!parsed.success) return false;
  if (!metrics || typeof metrics !== 'object') return false;
  const valid = parsed.data;

  switch (valid.kind) {
    case 'count': {
      const value = metrics[valid.metric];
      return isCountable(value) && value >= valid.gte;
    }
    case 'streak':
      return isCountable(metrics.longestStreak) && metrics.longestStreak >= valid.gte;
    case 'quiz_perfect':
      return metrics.quizPerfect === true;
  }
}

/** Ids from the catalog that qualify and have not already been earned. */
export function eligibleBadges(
  catalog: readonly BadgeCatalogEntry[],
  earnedIds: readonly string[],
  metrics: BadgeMetrics,
): string[] {
  const earned = new Set(earnedIds);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of catalog) {
    if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) continue;
    if (earned.has(entry.id) || seen.has(entry.id)) continue;
    if (!qualifiesForBadge(entry.rule, metrics)) continue;
    seen.add(entry.id);
    result.push(entry.id);
  }
  return result;
}
