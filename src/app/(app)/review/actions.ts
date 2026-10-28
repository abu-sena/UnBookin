'use server';

import { requireUser } from '@/lib/auth/session';
import { countDueTomorrow } from '@/lib/learning/queries';

/**
 * E6-01 AC4: cards due tomorrow after the session, read from the session
 * identity. A local action keeps the shared learning data layer untouched.
 */
export async function countReviewDueTomorrow(): Promise<number> {
  const user = await requireUser('/review');
  return countDueTomorrow({ userId: user.id });
}
