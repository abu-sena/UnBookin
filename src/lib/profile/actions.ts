'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { fieldErrorsFromIssues, parseLearningProfileForm } from './form';
import type { ProfileActionState } from './schema';
import { completeOnboarding, InvalidInterestError, upsertLearningProfile } from './store';

// FormData fields use the `learningProfileSchema` keys; `additionalInterestSlugs` may repeat.

function invalidInterest(): ProfileActionState {
  return {
    status: 'error',
    messageKey: 'invalidInterest',
    fieldErrors: {
      primaryInterestSlug: 'primaryInterestSlug',
      additionalInterestSlugs: 'additionalInterestSlugs',
    },
  };
}

/** E1-02: saves the profile, sets `onboarded_at`. */
export async function saveOnboarding(
  previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  void previous;
  const user = await requireUser('/onboarding');
  const parsed = parseLearningProfileForm(formData);
  if (!parsed.success) {
    return {
      status: 'error',
      messageKey: 'invalidInput',
      fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
    };
  }

  try {
    await completeOnboarding(user.id, parsed.data);
  } catch (error) {
    if (error instanceof InvalidInterestError) return invalidInterest();
    return { status: 'error', messageKey: 'generic' };
  }

  revalidatePath('/home');
  return { status: 'success' };
}

/** E1-02 AC3: edit the same answers from Settings. */
export async function updateLearningProfile(
  previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  void previous;
  const user = await requireUser('/settings');
  const parsed = parseLearningProfileForm(formData);
  if (!parsed.success) {
    return {
      status: 'error',
      messageKey: 'invalidInput',
      fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
    };
  }

  try {
    await upsertLearningProfile(user.id, parsed.data);
  } catch (error) {
    if (error instanceof InvalidInterestError) return invalidInterest();
    return { status: 'error', messageKey: 'generic' };
  }

  revalidatePath('/settings');
  return { status: 'success' };
}
