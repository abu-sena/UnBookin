import { describe, expect, it } from 'vitest';
import { parseLearningProfileForm, readLearningProfileForm } from '@/lib/profile/form';

function form() {
  const data = new FormData();
  data.set('displayName', ' Sena ');
  data.set('jobRole', 'Manajer operasional');
  data.set('primaryInterestSlug', 'leadership-management');
  data.append('additionalInterestSlugs', 'personal-development-productivity');
  data.append('additionalInterestSlugs', 'islamic-studies');
  data.set('goal', 'Memimpin rapat tim yang singkat dan jelas.');
  data.set('dailyGoalMinutes', '20');
  data.set('timezone', 'Asia/Jakarta');
  return data;
}

describe('learning profile FormData parsing', () => {
  it('collects every repeated additionalInterestSlugs value', () => {
    expect(readLearningProfileForm(form())).toMatchObject({
      additionalInterestSlugs: ['personal-development-productivity', 'islamic-studies'],
    });
  });

  it('parses a valid submission and coerces the daily goal', () => {
    const result = parseLearningProfileForm(form());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe('Sena');
      expect(result.data.additionalInterestSlugs).toHaveLength(2);
      expect(result.data.dailyGoalMinutes).toBe(20);
    }
  });

  it('drops an empty optional timezone instead of storing it', () => {
    const data = form();
    data.set('timezone', '');
    expect(readLearningProfileForm(data).timezone).toBeUndefined();
  });
});
