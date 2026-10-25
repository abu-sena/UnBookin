import 'server-only';
import { and, asc, count, countDistinct, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  actionReports,
  actions,
  badges,
  moduleProgress,
  profiles,
  quizAttempts,
  userBadges,
  userStats,
} from '@/db/schema';
import { requireUser } from '@/lib/auth/session';

export type ProfileBadge = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  earnedAt: Date | null;
};

export type ProfileSummary = {
  user: { name: string | null; image: string | null };
  displayName: string | null;
  level: number;
  totalXp: number;
  longestStreak: number;
  badges: ProfileBadge[];
  stats: {
    modulesRead: number;
    quizzesPassed: number;
    verifiedActions: number;
  };
};

/**
 * E15-01: the signed-in user's profile summary. The user id comes from the
 * server session only; every query is scoped to it. A missing `user_stats`
 * row maps to zeros so a fresh account still renders.
 */
export async function getMyProfileSummary(): Promise<ProfileSummary> {
  const user = await requireUser('/profile');

  const [profileRows, statsRows, badgeRows, moduleRows, quizRows, actionRows] = await Promise.all([
    db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1),
    db
      .select({
        level: userStats.level,
        totalXp: userStats.totalXp,
        longestStreak: userStats.longestStreak,
      })
      .from(userStats)
      .where(eq(userStats.userId, user.id))
      .limit(1),
    db
      .select({
        id: badges.id,
        slug: badges.slug,
        name: badges.name,
        description: badges.description,
        icon: badges.icon,
        tier: badges.tier,
        earnedAt: userBadges.earnedAt,
      })
      .from(badges)
      .leftJoin(userBadges, and(eq(userBadges.badgeId, badges.id), eq(userBadges.userId, user.id)))
      .orderBy(asc(badges.slug))
      .limit(200),
    db
      .select({ value: count() })
      .from(moduleProgress)
      .where(and(eq(moduleProgress.userId, user.id), eq(moduleProgress.status, 'read')))
      .limit(1),
    db
      .select({ value: countDistinct(quizAttempts.quizId) })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.userId, user.id), eq(quizAttempts.passed, true)))
      .limit(1),
    db
      .select({ value: count() })
      .from(actionReports)
      .innerJoin(actions, eq(actionReports.actionId, actions.id))
      .where(and(eq(actions.userId, user.id), eq(actionReports.verified, true)))
      .limit(1),
  ]);

  const stats = statsRows[0];

  return {
    user: { name: user.name ?? null, image: user.image ?? null },
    displayName: profileRows[0]?.displayName ?? null,
    level: stats?.level ?? 0,
    totalXp: stats?.totalXp ?? 0,
    longestStreak: stats?.longestStreak ?? 0,
    badges: badgeRows.map((badge) => ({
      ...badge,
      tier: badge.tier,
      earnedAt: badge.earnedAt ?? null,
    })),
    stats: {
      modulesRead: Number(moduleRows[0]?.value ?? 0),
      quizzesPassed: Number(quizRows[0]?.value ?? 0),
      verifiedActions: Number(actionRows[0]?.value ?? 0),
    },
  };
}
