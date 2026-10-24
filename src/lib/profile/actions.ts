'use server';

import type { ProfileActionState } from './schema';

// FormData fields use the `learningProfileSchema` keys; `additionalInterestSlugs` may repeat.

/** E1-02: saves the profile, sets `onboarded_at`. CONTRACT — implemented by task m2-onboarding. */
export async function saveOnboarding(
  previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  void previous;
  void formData;
  throw new Error('saveOnboarding is implemented in task m2-onboarding');
}

/** E1-02 AC3: edit the same answers from Settings. CONTRACT — implemented by task m2-onboarding. */
export async function updateLearningProfile(
  previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  void previous;
  void formData;
  throw new Error('updateLearningProfile is implemented in task m2-onboarding');
}
