import { describe, expect, it } from 'vitest';
import {
  allocateDomainXp,
  domainLevelFor,
  domainRequirements,
  DOMAIN_LEVELS,
} from '@/lib/game/domains';

const metrics = (xp: number, passedQuizzes: number, verifiedActions: number) => ({
  xp,
  passedQuizzes,
  verifiedActions,
});

describe('domainLevelFor', () => {
  it('starts at novice', () => {
    expect(domainLevelFor(metrics(0, 0, 0))).toBe('novice');
    expect(domainLevelFor(metrics(149, 99, 99))).toBe('novice');
  });

  it('requires the quiz gate for advanced beginner', () => {
    expect(domainLevelFor(metrics(150, 2, 0))).toBe('advanced_beginner');
    expect(domainLevelFor(metrics(500, 1, 10))).toBe('novice');
  });

  it('requires all lower gates for competent', () => {
    expect(domainLevelFor(metrics(500, 2, 1))).toBe('competent');
    expect(domainLevelFor(metrics(500, 2, 0))).toBe('advanced_beginner');
    expect(domainLevelFor(metrics(499, 2, 10))).toBe('advanced_beginner');
  });

  it('requires all lower gates for proficient', () => {
    expect(domainLevelFor(metrics(1_200, 2, 3))).toBe('proficient');
    expect(domainLevelFor(metrics(1_200, 2, 2))).toBe('competent');
  });

  it('requires all lower gates for expert', () => {
    expect(domainLevelFor(metrics(2_500, 2, 6))).toBe('expert');
    expect(domainLevelFor(metrics(9_999, 2, 5))).toBe('proficient');
    expect(domainLevelFor(metrics(9_999, 0, 99))).toBe('novice');
  });

  it('rejects invalid metrics', () => {
    expect(() => domainLevelFor(metrics(Number.NaN, 0, 0))).toThrow('invalidDomainXp');
    expect(() => domainLevelFor(metrics(-1, 0, 0))).toThrow('invalidDomainXp');
    expect(() => domainLevelFor(metrics(0, 1.5, 0))).toThrow('invalidPassedQuizzes');
    expect(() => domainLevelFor(metrics(0, 0, -1))).toThrow('invalidVerifiedActions');
  });
});

describe('domainRequirements', () => {
  it('returns the cumulative next gate for every non-expert level', () => {
    expect(domainRequirements('novice')).toEqual({
      nextLevel: 'advanced_beginner',
      xp: 150,
      passedQuizzes: 2,
      verifiedActions: 0,
    });
    expect(domainRequirements('advanced_beginner')).toEqual({
      nextLevel: 'competent',
      xp: 500,
      passedQuizzes: 2,
      verifiedActions: 1,
    });
    expect(domainRequirements('competent')).toEqual({
      nextLevel: 'proficient',
      xp: 1_200,
      passedQuizzes: 2,
      verifiedActions: 3,
    });
    expect(domainRequirements('proficient')).toEqual({
      nextLevel: 'expert',
      xp: 2_500,
      passedQuizzes: 2,
      verifiedActions: 6,
    });
  });

  it('returns null for expert and rejects unknown levels', () => {
    expect(domainRequirements('expert')).toBeNull();
    expect(() => domainRequirements('master' as never)).toThrow('invalidDomainLevel');
    expect(DOMAIN_LEVELS).toHaveLength(5);
  });
});

describe('allocateDomainXp', () => {
  it('allocates by normalized confidence', () => {
    expect(
      allocateDomainXp(100, [
        { domainId: 'a', confidence: 1 },
        { domainId: 'b', confidence: 1 },
        { domainId: 'c', confidence: 2 },
      ]),
    ).toEqual([
      { domainId: 'a', amount: 25 },
      { domainId: 'b', amount: 25 },
      { domainId: 'c', amount: 50 },
    ]);
  });

  it('breaks remainder ties by domain id and always sums exactly', () => {
    const result = allocateDomainXp(10, [
      { domainId: 'a', confidence: 1 },
      { domainId: 'b', confidence: 1 },
      { domainId: 'c', confidence: 1 },
    ]);
    expect(result).toEqual([
      { domainId: 'a', amount: 4 },
      { domainId: 'b', amount: 3 },
      { domainId: 'c', amount: 3 },
    ]);
    expect(result.reduce((sum, item) => sum + item.amount, 0)).toBe(10);
  });

  it('gives the extra point to the largest remainder', () => {
    expect(
      allocateDomainXp(7, [
        { domainId: 'a', confidence: 1 },
        { domainId: 'b', confidence: 2 },
      ]),
    ).toEqual([
      { domainId: 'a', amount: 2 },
      { domainId: 'b', amount: 5 },
    ]);
  });

  it('merges duplicate ids and ignores invalid or zero weights', () => {
    expect(
      allocateDomainXp(10, [
        { domainId: 'a', confidence: 1 },
        { domainId: 'a', confidence: 1 },
        { domainId: 'b', confidence: 2 },
        { domainId: 'c', confidence: 0 },
        { domainId: 'd', confidence: Number.NaN },
        { domainId: 'e', confidence: -3 },
        { domainId: '', confidence: 4 },
      ]),
    ).toEqual([
      { domainId: 'a', amount: 5 },
      { domainId: 'b', amount: 5 },
    ]);
  });

  it('returns an empty allocation when nothing is eligible', () => {
    expect(allocateDomainXp(50, [])).toEqual([]);
    expect(allocateDomainXp(50, [{ domainId: 'a', confidence: 0 }])).toEqual([]);
  });

  it('is deterministic and never duplicates a domain', () => {
    const input = [
      { domainId: 'b', confidence: 0.3 },
      { domainId: 'a', confidence: 0.7 },
    ];
    const first = allocateDomainXp(9, input);
    expect(allocateDomainXp(9, input)).toEqual(first);
    expect(new Set(first.map((item) => item.domainId)).size).toBe(first.length);
  });

  it('is independent of input order and duplicate placement', () => {
    const ab = allocateDomainXp(1, [
      { domainId: 'a', confidence: 0.5 },
      { domainId: 'b', confidence: 0.5 },
    ]);
    const ba = allocateDomainXp(1, [
      { domainId: 'b', confidence: 0.5 },
      { domainId: 'a', confidence: 0.5 },
    ]);
    expect(ab).toEqual([{ domainId: 'a', amount: 1 }]);
    expect(ba).toEqual(ab);
    const forward = [
      { domainId: 'c', confidence: 0.2 },
      { domainId: 'a', confidence: 0.3 },
      { domainId: 'b', confidence: 0.3 },
      { domainId: 'a', confidence: 0.2 },
    ];
    for (const amount of [1, 7, 13, 50]) {
      const first = allocateDomainXp(amount, forward);
      expect(allocateDomainXp(amount, [...forward].reverse())).toEqual(first);
      expect(first.reduce((sum, item) => sum + item.amount, 0)).toBe(amount);
    }
  });

  it('never returns NaN or infinite allocations for huge finite confidences', () => {
    const result = allocateDomainXp(10, [
      { domainId: 'a', confidence: Number.MAX_VALUE },
      { domainId: 'b', confidence: Number.MAX_VALUE },
    ]);
    expect(result).toEqual([
      { domainId: 'a', amount: 5 },
      { domainId: 'b', amount: 5 },
    ]);
    expect(
      allocateDomainXp(10, [{ domainId: 'a', confidence: Number.POSITIVE_INFINITY }]),
    ).toEqual([]);
  });

  it('rejects invalid amounts', () => {
    for (const amount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => allocateDomainXp(amount, [{ domainId: 'a', confidence: 1 }])).toThrow(
        'invalidXpAmount',
      );
    }
  });
});
