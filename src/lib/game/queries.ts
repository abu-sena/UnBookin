import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  actionReports,
  actions,
  badges,
  domainProgress,
  domains,
  interests,
  missionTemplates,
  moduleDomains,
  modules,
  unbooks,
  userBadges,
  userInterests,
  userMissions,
  xpEvents,
} from '@/db/schema';
import { domainRequirements, type DomainLevel, type DomainRequirement } from './domains';
import { assertGameUser, reconcileGame, type GameTransaction } from './engine';
import { MISSION_TYPES, type MissionType } from './missions';
import { XP_EVENT_TYPES } from './xp-rules';

export type GameIdentity = { userId: string };

export type GameSummaryMission = {
  id: string;
  title: string;
  type: MissionType;
  target: number;
  progress: number;
  xpReward: number;
  completed: boolean;
};

export type GameSummaryBadge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  earned: boolean;
};

export type GameSummary = {
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  progress: number;
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;
  activeToday: boolean;
  missions: GameSummaryMission[];
  badges: GameSummaryBadge[];
};

export type SkillTreeModule = { id: string; title: string; unbookId: string };
export type SkillTreeAction = { id: string; title: string };
export type SkillTreeDomain = {
  id: string;
  name: string;
  xp: number;
  level: DomainLevel;
  passedQuizzes: number;
  verifiedActions: number;
  nextRequirements: DomainRequirement | null;
  modules: SkillTreeModule[];
  actions: SkillTreeAction[];
};
export type SkillTreeInterest = {
  id: string;
  name: string;
  slug: string;
  domains: SkillTreeDomain[];
};
export type SkillTree = { interests: SkillTreeInterest[] };

function assertIdentity(identity: GameIdentity): string {
  const userId = identity?.userId;
  assertGameUser(userId);
  return userId;
}

function assertNow(now: Date): void {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalidDate');
}

/**
 * Weekly missions for the current local week. The engine has already
 * reconciled them, so this only reads the persisted rows and their templates.
 */
async function readMissions(
  tx: GameTransaction,
  userId: string,
  weekStart: string,
): Promise<GameSummaryMission[]> {
  const rows = await tx
    .select({
      id: userMissions.id,
      title: missionTemplates.title,
      type: missionTemplates.type,
      target: missionTemplates.target,
      progress: userMissions.progress,
      xpReward: missionTemplates.xpReward,
      completedAt: userMissions.completedAt,
    })
    .from(userMissions)
    .innerJoin(missionTemplates, eq(missionTemplates.id, userMissions.templateId))
    .where(and(eq(userMissions.userId, userId), eq(userMissions.weekStart, weekStart)));
  const order = new Map(MISSION_TYPES.map((type, index) => [type, index]));
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type as MissionType,
      target: row.target,
      progress: Math.min(row.progress, row.target),
      xpReward: row.xpReward,
      completed: row.completedAt !== null,
    }))
    .sort((a, b) => (order.get(a.type) ?? 9) - (order.get(b.type) ?? 9));
}

async function readBadges(tx: GameTransaction, userId: string): Promise<GameSummaryBadge[]> {
  const [catalog, earnedRows] = await Promise.all([
    tx
      .select({
        id: badges.id,
        name: badges.name,
        description: badges.description,
        icon: badges.icon,
        tier: badges.tier,
      })
      .from(badges)
      .orderBy(badges.createdAt, badges.slug),
    tx
      .select({ badgeId: userBadges.badgeId })
      .from(userBadges)
      .where(eq(userBadges.userId, userId)),
  ]);
  const earned = new Set(earnedRows.map((row) => row.badgeId));
  return catalog.map((badge) => ({
    id: badge.id,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    tier: badge.tier,
    earned: earned.has(badge.id),
  }));
}

/** Home/layout summary. Lazily reconciles first so M5 data is backfilled. */
export async function getGameSummary(
  identity: GameIdentity,
  now: Date = new Date(),
): Promise<GameSummary> {
  const userId = assertIdentity(identity);
  assertNow(now);
  return db.transaction(async (tx) => {
    const state = await reconcileGame(tx, userId, now);
    const missions = await readMissions(tx, userId, state.weekStart);
    const badgeList = await readBadges(tx, userId);
    return {
      totalXp: state.totalXp,
      level: state.level,
      currentLevelXp: state.currentLevelXp,
      nextLevelXp: state.nextLevelXp,
      progress: state.progress,
      currentStreak: state.currentStreak,
      longestStreak: state.longestStreak,
      streakFreezes: state.streakFreezes,
      activeToday: state.activeToday,
      missions,
      badges: badgeList,
    };
  });
}

/** Skill tree for selected interests plus interests that already have XP. */
export async function getSkillTree(
  identity: GameIdentity,
  now: Date = new Date(),
): Promise<SkillTree> {
  const userId = assertIdentity(identity);
  assertNow(now);
  return db.transaction(async (tx) => {
    await reconcileGame(tx, userId, now);

    const [selectedRows, progressRows] = await Promise.all([
      tx
        .select({
          id: interests.id,
          name: interests.name,
          slug: interests.slug,
          sortOrder: interests.sortOrder,
        })
        .from(userInterests)
        .innerJoin(interests, eq(interests.id, userInterests.interestId))
        .where(and(eq(userInterests.userId, userId), eq(interests.isActive, true))),
      tx
        .select({
          id: interests.id,
          name: interests.name,
          slug: interests.slug,
          sortOrder: interests.sortOrder,
          domainId: domainProgress.domainId,
          xp: domainProgress.xp,
          level: domainProgress.level,
          verifiedActions: domainProgress.verifiedActions,
        })
        .from(domainProgress)
        .innerJoin(domains, eq(domains.id, domainProgress.domainId))
        .innerJoin(interests, eq(interests.id, domains.interestId))
        .where(eq(domainProgress.userId, userId)),
    ]);

    const interestMap = new Map<
      string,
      { id: string; name: string; slug: string; sortOrder: number }
    >();
    for (const row of selectedRows) {
      if (row.slug === 'general') continue;
      interestMap.set(row.id, {
        id: row.id,
        name: row.name,
        slug: row.slug,
        sortOrder: row.sortOrder,
      });
    }
    for (const row of progressRows) {
      if (row.slug === 'general') continue;
      if (!interestMap.has(row.id)) {
        interestMap.set(row.id, {
          id: row.id,
          name: row.name,
          slug: row.slug,
          sortOrder: row.sortOrder,
        });
      }
    }
    const interestList = [...interestMap.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    if (!interestList.length) return { interests: [] };

    const interestIds = interestList.map((interest) => interest.id);
    const domainRows = await tx
      .select({
        id: domains.id,
        interestId: domains.interestId,
        name: domains.name,
        sortOrder: domains.sortOrder,
      })
      .from(domains)
      .where(inArray(domains.interestId, interestIds));
    domainRows.sort(
      (a, b) =>
        interestIds.indexOf(a.interestId) - interestIds.indexOf(b.interestId) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    );
    const domainIds = domainRows.map((domain) => domain.id);

    const progressByDomain = new Map(
      progressRows.map((row) => [
        row.domainId,
        { xp: row.xp, level: row.level, verifiedActions: row.verifiedActions },
      ]),
    );

    const moduleRows =
      domainIds.length > 0
        ? await tx
            .selectDistinct({
              domainId: moduleDomains.domainId,
              id: modules.id,
              title: modules.title,
              unbookId: modules.unbookId,
              sortOrder: modules.sortOrder,
            })
            .from(moduleDomains)
            .innerJoin(modules, eq(modules.id, moduleDomains.moduleId))
            .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
            .where(
              and(
                inArray(moduleDomains.domainId, domainIds),
                eq(unbooks.userId, userId),
                eq(unbooks.status, 'ready'),
              ),
            )
        : [];

    const actionRows =
      domainIds.length > 0
        ? await tx
            .selectDistinct({
              domainId: moduleDomains.domainId,
              id: actions.id,
              title: actions.title,
            })
            .from(actionReports)
            .innerJoin(actions, eq(actions.id, actionReports.actionId))
            .innerJoin(modules, eq(modules.id, actions.moduleId))
            .innerJoin(moduleDomains, eq(moduleDomains.moduleId, modules.id))
            .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
            .where(
              and(
                eq(actions.userId, userId),
                eq(actionReports.verified, true),
                eq(unbooks.userId, userId),
                eq(unbooks.status, 'ready'),
                inArray(moduleDomains.domainId, domainIds),
              ),
            )
        : [];

    const quizRows =
      domainIds.length > 0
        ? await tx
            .selectDistinct({
              domainId: moduleDomains.domainId,
              moduleId: xpEvents.refId,
            })
            .from(xpEvents)
            .innerJoin(modules, eq(modules.id, xpEvents.refId))
            .innerJoin(moduleDomains, eq(moduleDomains.moduleId, modules.id))
            .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
            .where(
              and(
                eq(xpEvents.userId, userId),
                eq(xpEvents.type, XP_EVENT_TYPES.QUIZ_PASS),
                eq(unbooks.userId, userId),
                inArray(moduleDomains.domainId, domainIds),
              ),
            )
        : [];

    const modulesByDomain = new Map<string, SkillTreeModule[]>();
    for (const row of moduleRows) {
      const list = modulesByDomain.get(row.domainId) ?? [];
      if (!list.some((module) => module.id === row.id)) {
        list.push({ id: row.id, title: row.title, unbookId: row.unbookId });
      }
      modulesByDomain.set(row.domainId, list);
    }
    const actionsByDomain = new Map<string, SkillTreeAction[]>();
    for (const row of actionRows) {
      const list = actionsByDomain.get(row.domainId) ?? [];
      if (!list.some((action) => action.id === row.id)) {
        list.push({ id: row.id, title: row.title });
      }
      actionsByDomain.set(row.domainId, list);
    }
    const passedByDomain = new Map<string, Set<string>>();
    for (const row of quizRows) {
      const set = passedByDomain.get(row.domainId) ?? new Set<string>();
      set.add(row.moduleId);
      passedByDomain.set(row.domainId, set);
    }

    const domainsByInterest = new Map<string, SkillTreeDomain[]>();
    for (const domain of domainRows) {
      const progress = progressByDomain.get(domain.id);
      const entry: SkillTreeDomain = {
        id: domain.id,
        name: domain.name,
        xp: progress?.xp ?? 0,
        level: progress?.level ?? 'novice',
        passedQuizzes: passedByDomain.get(domain.id)?.size ?? 0,
        verifiedActions: progress?.verifiedActions ?? 0,
        nextRequirements: domainRequirements(progress?.level ?? 'novice'),
        modules: modulesByDomain.get(domain.id) ?? [],
        actions: actionsByDomain.get(domain.id) ?? [],
      };
      const list = domainsByInterest.get(domain.interestId) ?? [];
      list.push(entry);
      domainsByInterest.set(domain.interestId, list);
    }

    return {
      interests: interestList.map((interest) => ({
        id: interest.id,
        name: interest.name,
        slug: interest.slug,
        domains: domainsByInterest.get(interest.id) ?? [],
      })),
    };
  });
}
