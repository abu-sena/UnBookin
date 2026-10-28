import 'server-only';
import { and, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import {
  actionReports,
  actions,
  cardStates,
  domainProgress,
  missionTemplates,
  moduleDomains,
  moduleProgress,
  modules,
  profiles,
  unbooks,
  userBadges,
  userInterests,
  userMissions,
  userStats,
  users,
  badges,
  xpEvents,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { resolveTimeZone } from '@/lib/billing/source-quota';
import { localDate } from '@/lib/learning/leitner';
import { allocateDomainXp, domainLevelFor, type DomainConfidence } from './domains';
import { qualifiesForBadge, type BadgeMetrics } from './badges';
import { levelProgress } from './levels';
import { missionProgress, selectWeeklyMissions, type MissionType } from './missions';
import { calculateStreak, localWeekStart } from './streak';
import { acquireGameLock } from './lock';
import {
  ACTION_REFLECTION,
  ACTION_VERIFIED,
  FIRST_UNBOOK,
  MODULE_READ,
  QUIZ_PASS,
  QUIZ_PERFECT_BONUS,
  REVIEW_DAILY,
  WEEKLY_MISSION_MAX,
  WEEKLY_MISSION_MIN,
  XP_EVENT_TYPES,
  XP_REF_TYPES,
} from './xp-rules';

type Database = PostgresJsDatabase<typeof schema>;
/** Transaction handle passed to `db.transaction(...)`. */
export type GameTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type GameState = {
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  progress: number;
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;
  lastActiveDate: string | null;
  activeToday: boolean;
  today: string;
  weekStart: string;
  timeZone: string;
};

type LedgerEvent = {
  type: string;
  amount: number;
  refType: string;
  refId: string;
  createdAt: Date;
};

type NewLedgerEvent = LedgerEvent & { userId: string };

const NEUTRAL_STATE: GameState = {
  totalXp: 0,
  level: 1,
  currentLevelXp: 0,
  nextLevelXp: 50,
  progress: 0,
  currentStreak: 0,
  longestStreak: 0,
  streakFreezes: 0,
  lastActiveDate: null,
  activeToday: false,
  today: '1970-01-01',
  weekStart: '1969-12-29',
  timeZone: 'Asia/Jakarta',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertGameUser(userId: string): void {
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    throw new Error('invalidUserId');
  }
}

function assertNow(now: Date): void {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalidDate');
}

/** Add whole days to a `YYYY-MM-DD` key without host-time-zone arithmetic. */
function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function addToMap(map: Map<string, number>, domainId: string, amount: number): void {
  map.set(domainId, (map.get(domainId) ?? 0) + amount);
}

function addToSetMap(map: Map<string, Set<string>>, domainId: string, value: string): void {
  const set = map.get(domainId) ?? new Set<string>();
  set.add(value);
  map.set(domainId, set);
}

/**
 * Insert a derived XP event exactly once. The unique (user, type, ref_type,
 * ref_id) constraint is the idempotency guard, so replay or concurrent calls
 * can never double a reward. The caller owns the surrounding transaction.
 */
async function insertDerivedEvent(
  tx: GameTransaction,
  event: NewLedgerEvent,
): Promise<LedgerEvent | null> {
  const [row] = await tx
    .insert(xpEvents)
    .values({
      userId: event.userId,
      type: event.type,
      amount: event.amount,
      refType: event.refType,
      refId: event.refId,
      createdAt: event.createdAt,
    })
    .onConflictDoNothing({
      target: [xpEvents.userId, xpEvents.type, xpEvents.refType, xpEvents.refId],
    })
    .returning({ id: xpEvents.id });
  if (!row) return null;
  return {
    type: event.type,
    amount: event.amount,
    refType: event.refType,
    refId: event.refId,
    createdAt: event.createdAt,
  };
}

/**
 * Recompute every derived game value for one user inside the caller's
 * transaction. It only reads unbooks/actions/progress; it writes the game scope
 * (ledger additions, stats, domain progress, badges, missions) after taking the
 * per-user advisory lock.
 */
export async function reconcileGame(
  tx: GameTransaction,
  userId: string,
  now: Date = new Date(),
): Promise<GameState> {
  assertGameUser(userId);
  assertNow(now);
  await acquireGameLock(tx, userId);

  const [userRow] = await tx
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) return NEUTRAL_STATE;

  const [profileRow] = await tx
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  const timeZone = resolveTimeZone(profileRow?.timezone);
  const today = localDate(now, timeZone);
  const weekStart = localWeekStart(now, timeZone);

  const eventRows = await tx
    .select({
      type: xpEvents.type,
      amount: xpEvents.amount,
      refType: xpEvents.refType,
      refId: xpEvents.refId,
      createdAt: xpEvents.createdAt,
    })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId));
  const ledger: LedgerEvent[] = eventRows.map((row) => ({ ...row }));

  await backfillFirstUnbook(tx, userId, ledger);
  await reconcileMissions(tx, userId, now, timeZone, weekStart, ledger);

  return reconcileDerived(tx, userId, now, timeZone, today, weekStart, userRow.createdAt, ledger);
}

/**
 * Open a fresh transaction and reconcile one user. This is the standalone entry
 * used by the hourly Inngest function and read paths.
 */
export async function reconcileUserGame(
  userId: string,
  now: Date = new Date(),
): Promise<GameState> {
  return db.transaction((tx) => reconcileGame(tx, userId, now));
}

async function backfillFirstUnbook(
  tx: GameTransaction,
  userId: string,
  ledger: LedgerEvent[],
): Promise<void> {
  if (ledger.some((event) => event.type === XP_EVENT_TYPES.FIRST_UNBOOK)) return;

  const ready = await tx
    .select({ completedAt: unbooks.completedAt, updatedAt: unbooks.updatedAt })
    .from(unbooks)
    .where(and(eq(unbooks.userId, userId), eq(unbooks.status, 'ready')));
  if (!ready.length) return;

  let earliest: Date | null = null;
  for (const row of ready) {
    const at = row.completedAt ?? row.updatedAt;
    if (!at || Number.isNaN(at.getTime())) continue;
    if (!earliest || at.getTime() < earliest.getTime()) earliest = at;
  }
  if (!earliest) return;

  const inserted = await insertDerivedEvent(tx, {
    userId,
    type: XP_EVENT_TYPES.FIRST_UNBOOK,
    amount: FIRST_UNBOOK,
    refType: XP_REF_TYPES.USER,
    refId: userId,
    createdAt: earliest,
  });
  if (inserted) ledger.push(inserted);
}

async function reconcileMissions(
  tx: GameTransaction,
  userId: string,
  now: Date,
  timeZone: string,
  weekStart: string,
  ledger: LedgerEvent[],
): Promise<void> {
  const templates = await tx
    .select({
      id: missionTemplates.id,
      slug: missionTemplates.slug,
      type: missionTemplates.type,
      target: missionTemplates.target,
      xpReward: missionTemplates.xpReward,
    })
    .from(missionTemplates);
  const selected = selectWeeklyMissions(templates, userId, weekStart);
  if (!selected.length) return;

  const applyActions = await scoredApplyActions(tx, userId, timeZone, weekStart);

  for (const template of selected) {
    const type = template.type as MissionType;
    const counted =
      type === 'apply' ? applyActions.size : missionProgress(type, ledger, weekStart, timeZone);
    // A zero row is still written so the UI always shows the three weekly missions.
    const capped = Math.min(template.target, Math.max(0, counted));

    const [existing] = await tx
      .select({
        id: userMissions.id,
        progress: userMissions.progress,
        completedAt: userMissions.completedAt,
      })
      .from(userMissions)
      .where(
        and(
          eq(userMissions.userId, userId),
          eq(userMissions.templateId, template.id),
          eq(userMissions.weekStart, weekStart),
        ),
      )
      .limit(1);

    let missionId: string;
    let completedAt: Date | null;
    let newlyCompleted = false;

    if (!existing) {
      completedAt = capped >= template.target ? now : null;
      const [created] = await tx
        .insert(userMissions)
        .values({ userId, templateId: template.id, weekStart, progress: capped, completedAt })
        .returning({ id: userMissions.id });
      if (!created) continue;
      missionId = created.id;
      newlyCompleted = completedAt !== null;
    } else {
      const nextProgress = Math.max(existing.progress, capped);
      completedAt = existing.completedAt ?? (nextProgress >= template.target ? now : null);
      if (!existing.completedAt && completedAt) newlyCompleted = true;
      missionId = existing.id;
      if (nextProgress !== existing.progress || completedAt !== existing.completedAt) {
        await tx
          .update(userMissions)
          .set({ progress: nextProgress, completedAt })
          .where(eq(userMissions.id, existing.id));
      }
    }

    if (!newlyCompleted) continue;
    if (
      !Number.isInteger(template.xpReward) ||
      template.xpReward < WEEKLY_MISSION_MIN ||
      template.xpReward > WEEKLY_MISSION_MAX
    ) {
      continue;
    }
    const inserted = await insertDerivedEvent(tx, {
      userId,
      type: XP_EVENT_TYPES.WEEKLY_MISSION,
      amount: template.xpReward,
      refType: XP_REF_TYPES.MISSION,
      refId: missionId,
      createdAt: now,
    });
    if (inserted) ledger.push(inserted);
  }
}

async function scoredApplyActions(
  tx: GameTransaction,
  userId: string,
  timeZone: string,
  weekStart: string,
): Promise<Set<string>> {
  const weekEnd = addDays(weekStart, 6);
  const rows = await tx
    .select({ actionId: actionReports.actionId, createdAt: actionReports.createdAt })
    .from(actionReports)
    .innerJoin(actions, eq(actions.id, actionReports.actionId))
    .where(and(eq(actions.userId, userId), isNotNull(actionReports.qualityScore)));

  const result = new Set<string>();
  for (const row of rows) {
    const day = localDate(row.createdAt, timeZone);
    if (day >= weekStart && day <= weekEnd) result.add(row.actionId);
  }
  return result;
}

async function reconcileDerived(
  tx: GameTransaction,
  userId: string,
  now: Date,
  timeZone: string,
  today: string,
  weekStart: string,
  joinedAt: Date,
  ledger: LedgerEvent[],
): Promise<GameState> {
  // Every positive ledger event, including weekly mission rewards, activates its
  // local day (PRD E8-04 AC1).
  const activeDates = ledger
    .filter((event) => event.amount > 0)
    .map((event) => localDate(event.createdAt, timeZone));
  const joinedFullDate = localDate(joinedAt, timeZone);
  const joinedDate = joinedFullDate > today ? today : joinedFullDate;
  const streak = calculateStreak({ activeDates, today, joinedDate });
  const totalXp = ledger.reduce((sum, event) => sum + event.amount, 0);
  const level = levelProgress(totalXp);

  await reconcileDomains(tx, userId, now, ledger);
  await reconcileBadges(tx, userId, streak.longestStreak, ledger);

  await tx
    .insert(userStats)
    .values({
      userId,
      totalXp,
      level: level.level,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      streakFreezes: streak.streakFreezes,
      lastActiveDate: streak.lastActiveDate,
    })
    .onConflictDoUpdate({
      target: userStats.userId,
      set: {
        totalXp,
        level: level.level,
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        streakFreezes: streak.streakFreezes,
        lastActiveDate: streak.lastActiveDate,
        updatedAt: now,
      },
    });

  return {
    totalXp,
    level: level.level,
    currentLevelXp: level.currentLevelXp,
    nextLevelXp: level.nextLevelXp,
    progress: level.progress,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    streakFreezes: streak.streakFreezes,
    lastActiveDate: streak.lastActiveDate,
    activeToday: streak.activeToday,
    today,
    weekStart,
    timeZone,
  };
}

async function reconcileDomains(
  tx: GameTransaction,
  userId: string,
  now: Date,
  ledger: LedgerEvent[],
): Promise<void> {
  const moduleRefIds = new Set<string>();
  const actionRefIds = new Set<string>();
  for (const event of ledger) {
    if (event.refType === XP_REF_TYPES.MODULE || event.refType === XP_REF_TYPES.MODULE_QUIZ) {
      moduleRefIds.add(event.refId);
    } else if (event.refType === XP_REF_TYPES.ACTION) {
      actionRefIds.add(event.refId);
    }
  }

  const ownedModules =
    moduleRefIds.size > 0
      ? await tx
          .select({ id: modules.id })
          .from(modules)
          .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
          .where(and(eq(unbooks.userId, userId), inArray(modules.id, [...moduleRefIds])))
      : [];
  const ownedModuleIds = new Set(ownedModules.map((row) => row.id));

  const ownedActions =
    actionRefIds.size > 0
      ? await tx
          .select({ id: actions.id, moduleId: actions.moduleId })
          .from(actions)
          .innerJoin(modules, eq(modules.id, actions.moduleId))
          .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
          .where(
            and(
              eq(actions.userId, userId),
              eq(unbooks.userId, userId),
              inArray(actions.id, [...actionRefIds]),
            ),
          )
      : [];
  const actionModules = new Map(ownedActions.map((row) => [row.id, row.moduleId]));

  const allModuleIds = new Set<string>(ownedModuleIds);
  for (const moduleId of actionModules.values()) allModuleIds.add(moduleId);

  const domainRows =
    allModuleIds.size > 0
      ? await tx
          .select({
            moduleId: moduleDomains.moduleId,
            domainId: moduleDomains.domainId,
            confidence: moduleDomains.confidence,
          })
          .from(moduleDomains)
          .where(inArray(moduleDomains.moduleId, [...allModuleIds]))
      : [];
  const moduleDomainsById = new Map<string, DomainConfidence[]>();
  for (const row of domainRows) {
    const list = moduleDomainsById.get(row.moduleId) ?? [];
    list.push({ domainId: row.domainId, confidence: row.confidence });
    moduleDomainsById.set(row.moduleId, list);
  }

  const domainXp = new Map<string, number>();
  const passedByDomain = new Map<string, Set<string>>();
  const verifiedByDomain = new Map<string, Set<string>>();

  for (const event of ledger) {
    let moduleId: string | null = null;
    if (event.refType === XP_REF_TYPES.MODULE || event.refType === XP_REF_TYPES.MODULE_QUIZ) {
      moduleId = ownedModuleIds.has(event.refId) ? event.refId : null;
    } else if (event.refType === XP_REF_TYPES.ACTION) {
      moduleId = actionModules.get(event.refId) ?? null;
    }
    if (!moduleId) continue;
    const domainLinks = moduleDomainsById.get(moduleId);
    if (!domainLinks?.length) continue;

    if (isModuleBoundXp(event)) {
      for (const allocation of allocateDomainXp(event.amount, domainLinks)) {
        addToMap(domainXp, allocation.domainId, allocation.amount);
      }
    }
    if (event.type === XP_EVENT_TYPES.QUIZ_PASS) {
      for (const link of domainLinks) addToSetMap(passedByDomain, link.domainId, moduleId);
    }
  }

  const verifiedRows = await tx
    .selectDistinct({ actionId: actionReports.actionId, moduleId: actions.moduleId })
    .from(actionReports)
    .innerJoin(actions, eq(actions.id, actionReports.actionId))
    .innerJoin(modules, eq(modules.id, actions.moduleId))
    .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
    .where(
      and(eq(actions.userId, userId), eq(unbooks.userId, userId), eq(actionReports.verified, true)),
    );
  for (const row of verifiedRows) {
    const domainLinks = moduleDomainsById.get(row.moduleId);
    if (!domainLinks?.length) continue;
    for (const link of domainLinks) {
      addToSetMap(verifiedByDomain, link.domainId, row.actionId);
    }
  }

  const existingProgress = await tx
    .select({ domainId: domainProgress.domainId })
    .from(domainProgress)
    .where(eq(domainProgress.userId, userId));
  const domainIds = new Set<string>([
    ...domainXp.keys(),
    ...passedByDomain.keys(),
    ...verifiedByDomain.keys(),
    ...existingProgress.map((row) => row.domainId),
  ]);

  for (const domainId of domainIds) {
    const xp = domainXp.get(domainId) ?? 0;
    const passedQuizzes = passedByDomain.get(domainId)?.size ?? 0;
    const verifiedActions = verifiedByDomain.get(domainId)?.size ?? 0;
    const level = domainLevelFor({ xp, passedQuizzes, verifiedActions });
    await tx
      .insert(domainProgress)
      .values({ userId, domainId, xp, level, verifiedActions })
      .onConflictDoUpdate({
        target: [domainProgress.userId, domainProgress.domainId],
        set: { xp, level, verifiedActions, updatedAt: now },
      });
  }
}

function isModuleBoundXp(event: LedgerEvent): boolean {
  if (event.refType === XP_REF_TYPES.MODULE || event.refType === XP_REF_TYPES.MODULE_QUIZ) {
    return (
      event.type === XP_EVENT_TYPES.MODULE_READ ||
      event.type === XP_EVENT_TYPES.QUIZ_PASS ||
      event.type === XP_EVENT_TYPES.QUIZ_PERFECT_BONUS
    );
  }
  if (event.refType === XP_REF_TYPES.ACTION) {
    return (
      event.type === XP_EVENT_TYPES.ACTION_VERIFIED ||
      event.type === XP_EVENT_TYPES.ACTION_REFLECTION
    );
  }
  return false;
}

async function reconcileBadges(
  tx: GameTransaction,
  userId: string,
  longestStreak: number,
  ledger: LedgerEvent[],
): Promise<void> {
  const [unbookCount, readCount, interestCount, cardSum] = await Promise.all([
    countColumn(tx, unbooks, eq(unbooks.userId, userId), eq(unbooks.status, 'ready')),
    countColumn(
      tx,
      moduleProgress,
      eq(moduleProgress.userId, userId),
      eq(moduleProgress.status, 'read'),
    ),
    countColumn(tx, userInterests, eq(userInterests.userId, userId)),
    sumColumn(tx, cardStates.reviewedCount, eq(cardStates.userId, userId)),
  ]);

  const verifiedRows = await tx
    .selectDistinct({ actionId: actionReports.actionId })
    .from(actionReports)
    .innerJoin(actions, eq(actions.id, actionReports.actionId))
    .where(and(eq(actions.userId, userId), eq(actionReports.verified, true)));

  const metrics: BadgeMetrics = {
    unbooks_completed: unbookCount,
    modules_read: readCount,
    actions_verified: verifiedRows.length,
    cards_reviewed: cardSum,
    interests_joined: interestCount,
    currentStreak: 0,
    longestStreak,
    quizPerfect: ledger.some((event) => event.type === XP_EVENT_TYPES.QUIZ_PERFECT_BONUS),
  };

  const catalog = await tx.select({ id: badges.id, rule: badges.rule }).from(badges);
  const earned = catalog
    .filter((badge) => qualifiesForBadge(badge.rule, metrics))
    .map((badge) => badge.id);
  if (!earned.length) return;
  await tx
    .insert(userBadges)
    .values(earned.map((badgeId) => ({ userId, badgeId })))
    .onConflictDoNothing({ target: [userBadges.userId, userBadges.badgeId] });
}

async function countColumn(
  tx: GameTransaction,
  table: PgTable,
  ...conditions: SQL[]
): Promise<number> {
  const [row] = await tx
    .select({ value: sql<number>`count(*)` })
    .from(table)
    .where(and(...conditions));
  return Number(row?.value ?? 0);
}

async function sumColumn(
  tx: GameTransaction,
  column: AnyPgColumn,
  ...conditions: SQL[]
): Promise<number> {
  const [row] = await tx
    .select({ value: sql<number>`coalesce(sum(${column}), 0)` })
    .from(cardStates)
    .where(and(...conditions));
  return Number(row?.value ?? 0);
}

export const GAME_EVENT_AMOUNTS = {
  MODULE_READ,
  QUIZ_PASS,
  QUIZ_PERFECT_BONUS,
  REVIEW_DAILY,
  ACTION_VERIFIED,
  ACTION_REFLECTION,
  FIRST_UNBOOK,
} as const;
