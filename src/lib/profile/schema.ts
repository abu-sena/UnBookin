import { z } from 'zod';

// E1-02 learning profile, shared by onboarding (`saveOnboarding`) and Settings (`updateLearningProfile`).
export const DAILY_GOAL_MINUTES = [5, 10, 20] as const;
export const EXPERIENCE_LEVELS = ['novice', 'intermediate', 'advanced'] as const;
export const MAX_ADDITIONAL_INTERESTS = 2;

export const learningProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(40),
    jobRole: z.string().trim().min(2).max(80),
    primaryInterestSlug: z.string().trim().min(1).max(100),
    additionalInterestSlugs: z
      .array(z.string().trim().min(1).max(100))
      .max(MAX_ADDITIONAL_INTERESTS)
      .default([]),
    goal: z.string().trim().min(10).max(200),
    dailyGoalMinutes: z.coerce
      .number()
      .refine((value) => (DAILY_GOAL_MINUTES as readonly number[]).includes(value)),
    /** IANA zone detected in the browser; invalid or missing falls back to the DB default. */
    timezone: z.string().trim().max(64).optional(),
    /** Not asked during onboarding (default `novice`); editable in Settings. */
    experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
  })
  .refine((value) => !value.additionalInterestSlugs.includes(value.primaryInterestSlug), {
    path: ['additionalInterestSlugs'],
  });

export type LearningProfileInput = z.infer<typeof learningProfileSchema>;
export type LearningProfileField = keyof LearningProfileInput;

export type LearningProfile = {
  displayName: string | null;
  jobRole: string | null;
  primaryInterestSlug: string | null;
  additionalInterestSlugs: string[];
  goal: string | null;
  dailyGoalMinutes: (typeof DAILY_GOAL_MINUTES)[number];
  timezone: string;
  experienceLevel: (typeof EXPERIENCE_LEVELS)[number];
  onboardedAt: Date | null;
};

export type SelectableInterest = { slug: string; name: string; description: string | null };

/** Field errors carry message keys under the `profileForm.errors` namespace, never raw Zod text. */
export type ProfileActionState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      messageKey: 'invalidInput' | 'invalidInterest' | 'generic';
      fieldErrors?: Partial<Record<LearningProfileField, string>>;
    };
