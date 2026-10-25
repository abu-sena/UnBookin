import 'server-only';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { interests, profiles, userInterests } from '@/db/schema';
import { requireUser } from '@/lib/auth/session';
import type { LearningProfile, SelectableInterest } from './schema';

/**
 * The signed-in user's learning profile (user id from `requireUser()`, never from the client);
 * null when no profile row exists yet.
 */
export async function getMyLearningProfile(): Promise<LearningProfile | null> {
  const user = await requireUser();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  if (!profile) return null;

  const selected = await db
    .select({ slug: interests.slug, isPrimary: userInterests.isPrimary })
    .from(userInterests)
    .innerJoin(interests, eq(userInterests.interestId, interests.id))
    .where(eq(userInterests.userId, user.id));

  const primary = selected.find((row) => row.isPrimary)?.slug ?? null;
  const additional = selected.filter((row) => !row.isPrimary).map((row) => row.slug);

  return {
    displayName: profile.displayName,
    jobRole: profile.jobRole,
    primaryInterestSlug: primary,
    additionalInterestSlugs: additional,
    goal: profile.goal,
    dailyGoalMinutes: profile.dailyGoalMinutes as LearningProfile['dailyGoalMinutes'],
    timezone: profile.timezone,
    experienceLevel: profile.experienceLevel,
    onboardedAt: profile.onboardedAt,
  };
}

/** Active interests a user can pick (excludes `general`), by `sort_order`. */
export async function getSelectableInterests(): Promise<SelectableInterest[]> {
  return db
    .select({ slug: interests.slug, name: interests.name, description: interests.description })
    .from(interests)
    .where(and(eq(interests.isActive, true), ne(interests.slug, 'general')))
    .orderBy(asc(interests.sortOrder), asc(interests.name));
}
