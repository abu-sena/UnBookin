import type { ZodIssue } from 'zod';
import {
  learningProfileSchema,
  type LearningProfileField,
  type LearningProfileInput,
} from './schema';

function textField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

/** Read the onboarding/settings form. `additionalInterestSlugs` may repeat, so use `getAll`. */
export function readLearningProfileForm(formData: FormData): Record<string, unknown> {
  return {
    displayName: textField(formData, 'displayName'),
    jobRole: textField(formData, 'jobRole'),
    primaryInterestSlug: textField(formData, 'primaryInterestSlug'),
    additionalInterestSlugs: formData
      .getAll('additionalInterestSlugs')
      .filter((value): value is string => typeof value === 'string'),
    goal: textField(formData, 'goal'),
    dailyGoalMinutes: textField(formData, 'dailyGoalMinutes'),
    timezone: textField(formData, 'timezone') || undefined,
    experienceLevel: textField(formData, 'experienceLevel') || undefined,
  };
}

export function parseLearningProfileForm(
  formData: FormData,
): ReturnType<typeof learningProfileSchema.safeParse> {
  return learningProfileSchema.safeParse(readLearningProfileForm(formData));
}

/**
 * Field errors carry the field name itself, which is also the key under
 * `profileForm.errors` in `messages/id.json` (e.g. `displayName`).
 */
export function fieldErrorsFromIssues(
  issues: readonly ZodIssue[],
): Partial<Record<LearningProfileField, string>> {
  const fieldErrors: Partial<Record<LearningProfileField, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === 'string') {
      fieldErrors[field as LearningProfileField] = field;
    }
  }
  return fieldErrors;
}

export type { LearningProfileInput };
