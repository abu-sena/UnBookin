import { describe, expect, it } from 'vitest';
import { learningProfileSchema } from '@/lib/profile/schema';

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    displayName: 'Sena',
    jobRole: 'Manajer operasional',
    primaryInterestSlug: 'leadership-management',
    additionalInterestSlugs: ['personal-development-productivity'],
    goal: 'Memimpin rapat tim yang singkat dan jelas.',
    dailyGoalMinutes: '10',
    timezone: 'Asia/Jakarta',
    ...overrides,
  };
}

describe('learningProfileSchema', () => {
  it('accepts a complete onboarding answer and coerces the daily goal', () => {
    const result = learningProfileSchema.safeParse(validInput());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dailyGoalMinutes).toBe(10);
  });

  it('rejects the primary interest duplicated in additional interests', () => {
    const result = learningProfileSchema.safeParse(
      validInput({
        additionalInterestSlugs: ['leadership-management'],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['additionalInterestSlugs']);
    }
  });

  it('rejects more than two additional interests', () => {
    const result = learningProfileSchema.safeParse(
      validInput({
        additionalInterestSlugs: [
          'personal-development-productivity',
          'islamic-studies',
          'general',
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a daily goal outside 5/10/20 minutes', () => {
    const result = learningProfileSchema.safeParse(validInput({ dailyGoalMinutes: '15' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['dailyGoalMinutes']);
    }
  });

  it('rejects a goal shorter than one short sentence', () => {
    const result = learningProfileSchema.safeParse(validInput({ goal: 'Belajar' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['goal']);
    }
  });

  it('defaults additional interests to an empty array', () => {
    const result = learningProfileSchema.safeParse(
      validInput({ additionalInterestSlugs: undefined }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.additionalInterestSlugs).toEqual([]);
  });
});
