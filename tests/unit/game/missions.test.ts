import { describe, expect, it } from 'vitest';
import {
  missionProgress,
  selectWeeklyMissions,
  type MissionTemplateInput,
} from '@/lib/game/missions';
import { missionSeeds } from '@/db/seed-data';

const templates: MissionTemplateInput[] = missionSeeds.map((seed) => ({
  id: seed.slug,
  slug: seed.slug,
  type: seed.type,
  target: seed.target,
  xpReward: seed.xpReward,
}));

const event = (type: string, createdAt: string, refId: string) => ({
  type,
  createdAt: new Date(createdAt),
  refId,
});

describe('selectWeeklyMissions', () => {
  it('selects exactly one valid mission per type', () => {
    const result = selectWeeklyMissions(templates, 'user-1', '2026-10-26');
    expect(result.map((item) => item.type)).toEqual(['learn', 'review', 'apply']);
    expect(new Set(result.map((item) => item.id)).size).toBe(3);
    for (const item of result) {
      expect(templates).toContainEqual(item);
      expect(item.target).toBeGreaterThan(0);
      expect(item.xpReward).toBeGreaterThanOrEqual(30);
      expect(item.xpReward).toBeLessThanOrEqual(60);
    }
  });

  it('is deterministic per user and week', () => {
    const week = '2026-10-26';
    const first = selectWeeklyMissions(templates, 'user-1', week);
    expect(selectWeeklyMissions(templates, 'user-1', week)).toEqual(first);
    expect(selectWeeklyMissions([...templates].reverse(), 'user-1', week)).toEqual(first);
  });

  it('does not depend on template input order', () => {
    const week = '2026-11-02';
    const a = selectWeeklyMissions(templates, 'user-42', week);
    const b = selectWeeklyMissions([...templates].reverse(), 'user-42', week);
    expect(b).toEqual(a);
  });

  it('filters invalid targets, rewards, types and ids', () => {
    const result = selectWeeklyMissions(
      [
        { id: 'ok-learn', slug: 'ok-learn', type: 'learn', target: 3, xpReward: 30 },
        { id: 'zero-target', slug: 'zero-target', type: 'learn', target: 0, xpReward: 30 },
        { id: 'cheap', slug: 'cheap', type: 'learn', target: 3, xpReward: 29 },
        { id: 'pricey', slug: 'pricey', type: 'learn', target: 3, xpReward: 61 },
        { id: 'float', slug: 'float', type: 'review', target: 1.5, xpReward: 30 },
        { id: '', slug: 'no-id', type: 'apply', target: 1, xpReward: 30 },
        { id: 'bad-type', slug: 'bad-type', type: 'nope' as never, target: 1, xpReward: 30 },
        { id: 'ok-apply', slug: 'ok-apply', type: 'apply', target: 1, xpReward: 60 },
      ],
      'user-1',
      '2026-10-26',
    );
    expect(result.map((item) => item.id)).toEqual(['ok-learn', 'ok-apply']);
  });

  it('skips types with no valid candidates', () => {
    const result = selectWeeklyMissions(
      [{ id: 'only', slug: 'only', type: 'review', target: 2, xpReward: 30 }],
      'user-1',
      '2026-10-26',
    );
    expect(result.map((item) => item.type)).toEqual(['review']);
  });

  it('rejects missing user, invalid dates and non-array templates', () => {
    expect(() => selectWeeklyMissions(templates, '', '2026-10-26')).toThrow('invalidUserId');
    expect(() => selectWeeklyMissions(templates, 'user-1', '2026-02-30')).toThrow('invalidDate');
    expect(() => selectWeeklyMissions(null as never, 'user-1', '2026-10-26')).toThrow(
      'invalidTemplates',
    );
  });
});

describe('missionProgress', () => {
  const weekStart = '2026-10-26';

  it('counts distinct refs per matching event type inside Monday..Sunday', () => {
    const events = [
      event('module_read', '2026-10-26T03:00:00.000Z', 'm1'),
      event('module_read', '2026-10-27T03:00:00.000Z', 'm1'),
      event('module_read', '2026-10-28T03:00:00.000Z', 'm2'),
      event('quiz_pass', '2026-10-28T03:00:00.000Z', 'q1'),
      event('review_daily', '2026-10-29T03:00:00.000Z', 'r1'),
      event('review_daily', '2026-11-02T03:00:00.000Z', 'r2'),
      event('action_verified', '2026-11-01T03:00:00.000Z', 'a1'),
      event('action_verified', '2026-10-25T03:00:00.000Z', 'a2'),
    ];

    expect(missionProgress('learn', events, weekStart, 'UTC')).toBe(2);
    expect(missionProgress('review', events, weekStart, 'UTC')).toBe(1);
    expect(missionProgress('apply', events, weekStart, 'UTC')).toBe(1);
  });

  it('never counts mission XP events', () => {
    const events = [
      event('mission_xp', '2026-10-27T03:00:00.000Z', 'bonus-1'),
      event('mission_complete', '2026-10-27T03:00:00.000Z', 'bonus-2'),
    ];
    expect(missionProgress('learn', events, weekStart, 'UTC')).toBe(0);
    expect(missionProgress('review', events, weekStart, 'UTC')).toBe(0);
    expect(missionProgress('apply', events, weekStart, 'UTC')).toBe(0);
  });

  it('uses the local week, including the Sunday boundary', () => {
    const events = [
      event('action_verified', '2026-11-01T16:59:59.000Z', 'sunday-end'),
      event('action_verified', '2026-11-01T17:00:00.000Z', 'next-monday'),
    ];
    expect(missionProgress('apply', events, weekStart, 'Asia/Jakarta')).toBe(1);
  });

  it('applies the local date when the UTC instant is the previous day', () => {
    const events = [event('module_read', '2026-10-26T00:30:00.000Z', 'm1')];
    expect(missionProgress('learn', events, weekStart, 'Asia/Jakarta')).toBe(1);
    expect(missionProgress('learn', events, weekStart, 'America/New_York')).toBe(0);
  });

  it('ignores malformed events and empty refs', () => {
    const events = [
      { type: 'module_read', createdAt: new Date(Number.NaN), refId: 'bad-date' },
      event('module_read', '2026-10-27T03:00:00.000Z', ''),
      event('module_read', '2026-10-27T03:00:00.000Z', 'ok'),
      null as never,
    ];
    expect(missionProgress('learn', events, weekStart, 'UTC')).toBe(1);
  });

  it('does not count the same ref twice, even on different days', () => {
    const events = [
      event('review_daily', '2026-10-27T03:00:00.000Z', 'r1'),
      event('review_daily', '2026-10-28T03:00:00.000Z', 'r1'),
    ];
    expect(missionProgress('review', events, weekStart, 'UTC')).toBe(1);
  });

  it('rejects invalid mission types, week starts and events', () => {
    expect(() => missionProgress('learn' as never, [], '2026-10-27', 'UTC')).toThrow(
      'invalidWeekStart',
    );
    expect(() => missionProgress('nope' as never, [], weekStart, 'UTC')).toThrow(
      'invalidMissionType',
    );
    expect(() => missionProgress('learn', null as never, weekStart, 'UTC')).toThrow(
      'invalidEvents',
    );
  });
});
