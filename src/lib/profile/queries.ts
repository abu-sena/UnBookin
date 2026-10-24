import 'server-only';
import type { LearningProfile, SelectableInterest } from './schema';

/**
 * The signed-in user's learning profile (user id from `requireUser()`, never from the client);
 * null when no profile row exists yet. CONTRACT — implemented by task m2-onboarding.
 */
export async function getMyLearningProfile(): Promise<LearningProfile | null> {
  throw new Error('getMyLearningProfile is implemented in task m2-onboarding');
}

/** Active interests a user can pick (excludes `general`), by `sort_order`. CONTRACT — m2-onboarding. */
export async function getSelectableInterests(): Promise<SelectableInterest[]> {
  throw new Error('getSelectableInterests is implemented in task m2-onboarding');
}
