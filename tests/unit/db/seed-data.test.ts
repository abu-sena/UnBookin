import { describe, expect, it } from 'vitest';
import { BadgeRule } from '../../../src/lib/game/badge-rules';
import { PlanLimits } from '../../../src/lib/billing/plan-limits';
import {
  badgeSeeds,
  domainSeeds,
  interestSeeds,
  missionSeeds,
  planSeeds,
} from '../../../src/db/seed-data';

describe('PRD seed data', () => {
  it('validates every plan and preserves exact prices', () => {
    for (const plan of planSeeds) expect(PlanLimits.safeParse(plan.limits).success).toBe(true);
    expect(Object.fromEntries(planSeeds.map((plan) => [plan.code, plan.priceIdr]))).toEqual({
      free: 0,
      pro_monthly: 59000,
      pro_yearly: 449000,
      byok_monthly: 29000,
      byok_yearly: 249000,
    });
  });

  it('preserves quota differences across all billing intervals', () => {
    for (const plan of planSeeds) {
      const expected =
        plan.code === 'free'
          ? [2, 2, 60, 20, 20, 'sample', 'economy']
          : plan.code.startsWith('pro_')
            ? [8, 8, 500, 100, 300, 'full', 'main']
            : [null, 50, 800, 100, null, 'full', 'byok'];
      const limits = plan.limits;
      expect([
        limits.unbooksPerMonth,
        limits.unbooksFairUse,
        limits.maxPagesPerSource,
        limits.maxFileMb,
        limits.mentorMessagesPerMonth,
        limits.originalsAccess,
        limits.modelTier,
      ]).toEqual(expected);
    }
  });

  it('provides at least 12 valid badges including all nine PRD badges', () => {
    expect(badgeSeeds.length).toBeGreaterThanOrEqual(12);
    for (const badge of badgeSeeds) expect(BadgeRule.safeParse(badge.rule).success).toBe(true);
    expect(badgeSeeds.map((badge) => badge.name)).toEqual(
      expect.arrayContaining([
        'Langkah Pertama',
        'Pembaca Tekun',
        'Sempurna',
        'Praktisi',
        'Konsisten 7',
        'Konsisten 30',
        'Pengingat Ulung',
        'Penjelajah',
        'Murabbi Diri',
      ]),
    );
  });

  it('provides three missions per type with rewards between 30 and 60', () => {
    for (const type of ['learn', 'review', 'apply'])
      expect(missionSeeds.filter((mission) => mission.type === type).length).toBeGreaterThanOrEqual(
        3,
      );
    for (const mission of missionSeeds) {
      expect(mission.target).toBeGreaterThan(0);
      expect(mission.xpReward).toBeGreaterThanOrEqual(30);
      expect(mission.xpReward).toBeLessThanOrEqual(60);
    }
  });

  it('seeds 18 named domains and catch-all without domains', () => {
    expect(interestSeeds.map((interest) => interest.name)).toEqual([
      'Kepemimpinan dan Manajemen',
      'Pengembangan Diri dan Produktivitas',
      'Studi Islam',
      'Umum',
    ]);
    expect(domainSeeds).toHaveLength(18);
    expect(domainSeeds.filter((domain) => domain.interestSlug === 'general')).toEqual([]);
    for (const rows of [interestSeeds, domainSeeds, badgeSeeds, missionSeeds])
      expect(new Set(rows.map((row) => row.slug)).size).toBe(rows.length);
  });
});
