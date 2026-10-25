import 'server-only';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/db';
import { interests, notificationPrefs, profiles, userInterests, userStats } from '@/db/schema';
import { MAX_ADDITIONAL_INTERESTS, type LearningProfileInput } from './schema';

/** Raised when a submitted slug is not an active, selectable interest. */
export class InvalidInterestError extends Error {
  constructor() {
    super('Invalid interest');
    this.name = 'InvalidInterestError';
  }
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function supportedTimezone(timezone: string | undefined): string | undefined {
  if (!timezone) return undefined;
  if (typeof Intl.supportedValuesOf !== 'function') return undefined;
  return Intl.supportedValuesOf('timeZone').includes(timezone) ? timezone : undefined;
}

async function writeProfile(tx: Transaction, userId: string, input: LearningProfileInput) {
  const slugs = [input.primaryInterestSlug, ...input.additionalInterestSlugs];
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length !== slugs.length) throw new InvalidInterestError();
  if (input.additionalInterestSlugs.length > MAX_ADDITIONAL_INTERESTS) {
    throw new InvalidInterestError();
  }

  const selectable = await tx
    .select({ id: interests.id, slug: interests.slug })
    .from(interests)
    .where(
      and(
        inArray(interests.slug, uniqueSlugs),
        eq(interests.isActive, true),
        ne(interests.slug, 'general'),
      ),
    );
  if (selectable.length !== uniqueSlugs.length) throw new InvalidInterestError();

  const timezone = supportedTimezone(input.timezone);
  const profileValues = {
    displayName: input.displayName,
    jobRole: input.jobRole,
    goal: input.goal,
    dailyGoalMinutes: input.dailyGoalMinutes,
    ...(timezone ? { timezone } : {}),
    ...(input.experienceLevel ? { experienceLevel: input.experienceLevel } : {}),
  };

  await tx
    .insert(profiles)
    .values({ userId, ...profileValues })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: profileValues,
    });

  await tx.delete(userInterests).where(eq(userInterests.userId, userId));

  const idBySlug = new Map(selectable.map((row) => [row.slug, row.id]));

  const rows = slugs.map((slug, index) => {
    const interestId = idBySlug.get(slug);
    if (!interestId) throw new InvalidInterestError();
    return { userId, interestId, isPrimary: index === 0 };
  });
  await tx.insert(userInterests).values(rows);
}

/**
 * Shared profile writer. The caller always passes the user id from the server
 * session, never from the client. Runs as one transaction.
 */
export async function upsertLearningProfile(
  userId: string,
  input: LearningProfileInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await writeProfile(tx, userId, input);
  });
}

/** Save onboarding answers, mark the profile onboarded once, and seed default rows. */
export async function completeOnboarding(
  userId: string,
  input: LearningProfileInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await writeProfile(tx, userId, input);
    await tx
      .update(profiles)
      .set({ onboardedAt: new Date() })
      .where(and(eq(profiles.userId, userId), isNull(profiles.onboardedAt)));
    await tx.insert(userStats).values({ userId }).onConflictDoNothing({ target: userStats.userId });
    await tx
      .insert(notificationPrefs)
      .values({ userId })
      .onConflictDoNothing({ target: notificationPrefs.userId });
  });
}
