import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

/**
 * REAL-DB integration for the M6 game engine. SKIPPED unless GAME_DB_URL is set.
 * The runner exports DATABASE_URL and GAME_DB_URL to the same LOCAL test URL.
 * Safety: the URL must point to 127.0.0.1/localhost AND a database whose name
 * contains "test"; anything else is refused with an error. Every fixture uses
 * fresh UUIDs and only those ids are removed in `finally`.
 */
const URL_VALUE = process.env.GAME_DB_URL ?? '';

function assertLocalTestDatabase(value: string): void {
  const parsed = new URL(value);
  const host = parsed.hostname;
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['127.0.0.1', 'localhost'].includes(host) || !name.includes('test')) {
    throw new Error('GAME_DB_URL must be a local database whose name includes "test".');
  }
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

const WEDNESDAY = new Date('2026-10-28T05:00:00Z'); // 12:00 in Asia/Jakarta

describe.skipIf(!URL_VALUE)('game engine real-DB integration (isolated local DB)', () => {
  it('reconciles the ledger, domains, missions, badges and locks correctly', async () => {
    assertLocalTestDatabase(URL_VALUE);
    const inherited = process.env.DATABASE_URL;
    if (inherited && inherited !== URL_VALUE) {
      throw new Error('DATABASE_URL must be unset or equal to GAME_DB_URL for this test.');
    }
    process.env.DATABASE_URL = URL_VALUE;
    const client = postgres(URL_VALUE, { prepare: false, max: 4 });
    const db: Db = drizzle(client, { schema, casing: 'snake_case' });

    const userIds: string[] = [];
    const unbookIds: string[] = [];
    const badgeIds: string[] = [];
    const templateIds: string[] = [];
    const interestId = randomUUID();
    const domainA = randomUUID();
    const domainB = randomUUID();
    const suffix = randomUUID().slice(0, 8);

    const engine = await import('@/lib/game/engine');
    const xp = await import('@/lib/game/xp');
    const queries = await import('@/lib/game/queries');
    const { selectWeeklyMissions } = await import('@/lib/game/missions');

    async function learner(options: {
      userId?: string;
      timezone?: string;
      joinedAt?: Date;
      completedAt?: Date | null;
      moduleCount?: number;
    }) {
      const userId = options.userId ?? randomUUID();
      const unbookId = randomUUID();
      userIds.push(userId);
      unbookIds.push(unbookId);
      await db.insert(schema.users).values({
        id: userId,
        name: 'M6 Check',
        createdAt: options.joinedAt ?? new Date('2026-10-01T00:00:00Z'),
      });
      await db.insert(schema.profiles).values({
        userId,
        timezone: options.timezone ?? 'Asia/Jakarta',
        onboardedAt: new Date('2026-10-01T00:00:00Z'),
      });
      await db.insert(schema.unbooks).values({
        id: unbookId,
        userId,
        title: 'Unbook M6',
        interestId,
        status: 'ready',
        moduleCount: options.moduleCount ?? 2,
        completedAt:
          options.completedAt === undefined
            ? new Date('2026-10-05T03:00:00Z')
            : options.completedAt,
      });
      const moduleIds = Array.from({ length: options.moduleCount ?? 2 }, () => randomUUID());
      await db.insert(schema.modules).values(
        moduleIds.map((id, index) => ({
          id,
          unbookId,
          sortOrder: index,
          title: `Modul ${index}`,
        })),
      );
      await db.insert(schema.moduleDomains).values(
        moduleIds.flatMap((moduleId) => [
          { moduleId, domainId: domainA, confidence: 0.75 },
          { moduleId, domainId: domainB, confidence: 0.25 },
        ]),
      );
      return { userId, unbookId, moduleIds };
    }

    const ledgerOf = (userId: string) =>
      db.select().from(schema.xpEvents).where(eq(schema.xpEvents.userId, userId));
    const totalOf = async (userId: string) =>
      (await db.select().from(schema.userStats).where(eq(schema.userStats.userId, userId)))[0];
    const domainOf = async (userId: string, domainId: string) =>
      (
        await db
          .select()
          .from(schema.domainProgress)
          .where(
            and(
              eq(schema.domainProgress.userId, userId),
              eq(schema.domainProgress.domainId, domainId),
            ),
          )
      )[0];

    try {
      await db.insert(schema.interests).values({
        id: interestId,
        slug: `m6-check-${suffix}`,
        name: 'M6 Check',
        colorToken: 'primary',
      });
      await db.insert(schema.domains).values([
        { id: domainA, interestId, slug: 'a', name: 'Domain A', sortOrder: 0 },
        { id: domainB, interestId, slug: 'b', name: 'Domain B', sortOrder: 1 },
      ]);
      // Own fixtures for the catalogs; real seeds in the DB are never modified.
      const templates = [
        { type: 'learn' as const, target: 2, xpReward: 30 },
        { type: 'review' as const, target: 5, xpReward: 45 },
        { type: 'apply' as const, target: 1, xpReward: 60 },
      ].map((row) => ({ id: randomUUID(), slug: `m6-${row.type}-${suffix}`, title: 'M6', ...row }));
      await db.insert(schema.missionTemplates).values(templates);
      templateIds.push(...templates.map((row) => row.id));
      const badgeRows = [
        {
          slug: `m6-unbook-${suffix}`,
          rule: { kind: 'count', metric: 'unbooks_completed', gte: 1 },
        },
        { slug: `m6-cards-${suffix}`, rule: { kind: 'count', metric: 'cards_reviewed', gte: 5 } },
        { slug: `m6-read-${suffix}`, rule: { kind: 'count', metric: 'modules_read', gte: 2 } },
        { slug: `m6-perfect-${suffix}`, rule: { kind: 'quiz_perfect' } },
        { slug: `m6-bad-${suffix}`, rule: { kind: 'count', metric: 'bogus', gte: 1 } },
      ].map((row) => ({
        id: randomUUID(),
        name: row.slug,
        description: 'M6',
        icon: 'star',
        tier: 'bronze' as const,
        ...row,
      })) as (typeof schema.badges.$inferInsert)[];
      await db.insert(schema.badges).values(badgeRows);
      badgeIds.push(...badgeRows.map((row) => row.id!));

      // The selected mission set depends on every template in the DB (seeds too),
      // so expectations are derived from the same pure selector.
      const allTemplates = await db.select().from(schema.missionTemplates);
      const expectedSelection = (userId: string, weekStart: string) =>
        selectWeeklyMissions(
          allTemplates.map((row) => ({ ...row, type: row.type })),
          userId,
          weekStart,
        );

      // ---- 1. Backfill of old M5 XP, repeat stability, exact domain split -----
      const a = await learner({ moduleCount: 2 });
      const [m1, m2] = a.moduleIds as [string, string];
      const old = (type: string, refType: string, refId: string, amount: number, at: string) => ({
        userId: a.userId,
        type,
        refType,
        refId,
        amount,
        createdAt: new Date(at),
      });
      await db
        .insert(schema.xpEvents)
        .values([
          old('module_read', 'module', m1, 20, '2026-10-20T03:00:00Z'),
          old('quiz_pass', 'module_quiz', m1, 30, '2026-10-20T03:10:00Z'),
          old('quiz_perfect', 'module_quiz', m1, 10, '2026-10-20T03:10:00Z'),
          old('module_read', 'module', m2, 20, '2026-10-21T03:00:00Z'),
          old('review_daily', 'review', randomUUID(), 10, '2026-10-21T03:20:00Z'),
        ]);
      await db.insert(schema.moduleProgress).values([
        { userId: a.userId, moduleId: m1, status: 'read' },
        { userId: a.userId, moduleId: m2, status: 'read' },
      ]);
      const review = randomUUID();
      const chunkless = await db
        .insert(schema.reviewCards)
        .values([{ id: review, moduleId: m1, front: 'q', back: 'a' }])
        .returning({ id: schema.reviewCards.id });
      await db.insert(schema.cardStates).values({
        userId: a.userId,
        cardId: chunkless[0]!.id,
        reviewedCount: 5,
      });

      const first = await engine.reconcileUserGame(a.userId, WEDNESDAY);
      expect(first.totalXp).toBe(140); // 90 old module/quiz/review + 50 first Unbook (no missions yet)
      const ledger1 = await ledgerOf(a.userId);
      const firstUnbook = ledger1.find((row) => row.type === 'first_unbook')!;
      expect(firstUnbook).toMatchObject({ amount: 50, refType: 'user', refId: a.userId });
      // Backdated to the Unbook completion, not to the day it was read.
      expect(firstUnbook.createdAt.toISOString()).toBe('2026-10-05T03:00:00.000Z');

      // Each module-bound event is split with largest remainder at 75/25:
      // 20 -> 15/5, 30 -> 23/7, 10 -> 8/2, 20 -> 15/5. Sum 80 == 61 + 19.
      expect((await domainOf(a.userId, domainA))?.xp).toBe(61);
      expect((await domainOf(a.userId, domainB))?.xp).toBe(19);

      const second = await engine.reconcileUserGame(a.userId, WEDNESDAY);
      const ledger2 = await ledgerOf(a.userId);
      expect(second.totalXp).toBe(first.totalXp);
      expect(ledger2.map((row) => row.id).sort()).toEqual(ledger1.map((row) => row.id).sort());
      expect((await totalOf(a.userId))?.totalXp).toBe(first.totalXp);

      // Badges: counts from current tables; invalid rule skipped; seeds untouched.
      const earned = await db
        .select({ badgeId: schema.userBadges.badgeId })
        .from(schema.userBadges)
        .where(
          and(eq(schema.userBadges.userId, a.userId), inArray(schema.userBadges.badgeId, badgeIds)),
        );
      const earnedSlugs = new Set(
        badgeRows.filter((row) => earned.some((e) => e.badgeId === row.id)).map((row) => row.slug),
      );
      expect(earnedSlugs).toEqual(
        new Set([
          `m6-unbook-${suffix}`,
          `m6-cards-${suffix}`,
          `m6-read-${suffix}`,
          `m6-perfect-${suffix}`,
        ]),
      );

      // ---- 2. Missions: one per type, learn from reads, rollover, no retro -----
      const week1 = await db
        .select()
        .from(schema.userMissions)
        .where(
          and(
            eq(schema.userMissions.userId, a.userId),
            eq(schema.userMissions.weekStart, '2026-10-26'),
          ),
        );
      expect(week1).toHaveLength(expectedSelection(a.userId, '2026-10-26').length);
      expect(new Set(week1.map((row) => row.templateId)).size).toBe(week1.length);
      // Reads happened last week, so nothing counts toward this week's learn mission.
      expect(week1.every((row) => row.progress === 0)).toBe(true);

      await engine.reconcileUserGame(a.userId, new Date('2026-11-04T05:00:00Z'));
      const allMissions = await db
        .select()
        .from(schema.userMissions)
        .where(eq(schema.userMissions.userId, a.userId));
      expect(new Set(allMissions.map((row) => row.weekStart))).toEqual(
        new Set(['2026-10-26', '2026-11-02']),
      );

      // ---- 3. Verified actions: one per action even with a revision; low report --
      const b = await learner({ moduleCount: 1 });
      const [bm] = b.moduleIds as [string];
      const actionId = randomUUID();
      await db.insert(schema.actions).values({
        id: actionId,
        userId: b.userId,
        moduleId: bm,
        title: 'Laporkan',
        status: 'planned',
      });
      await db.insert(schema.actionReports).values({
        actionId,
        whatIDid: 'x'.repeat(30),
        result: 'x'.repeat(30),
        reflection: '',
        qualityScore: 2,
        verified: false,
        createdAt: new Date('2026-10-27T02:00:00Z'),
      });
      const low = await engine.reconcileUserGame(b.userId, WEDNESDAY);
      expect((await ledgerOf(b.userId)).some((row) => row.type === 'action_verified')).toBe(false);
      expect((await domainOf(b.userId, domainA))?.verifiedActions ?? 0).toBe(0);
      const applyTemplate = expectedSelection(b.userId, '2026-10-26').find(
        (row) => row.type === 'apply',
      );
      const applyRow = (
        await db
          .select()
          .from(schema.userMissions)
          .where(
            and(
              eq(schema.userMissions.userId, b.userId),
              eq(schema.userMissions.templateId, applyTemplate!.id),
            ),
          )
      )[0];
      // A scored low report counts as a reported action for the apply mission.
      expect(applyRow?.progress).toBe(Math.min(1, applyTemplate!.target));
      expect(low.totalXp).toBeGreaterThanOrEqual(50);

      await db.insert(schema.actionReports).values({
        actionId,
        whatIDid: 'y'.repeat(30),
        result: 'y'.repeat(30),
        reflection: 'z'.repeat(30),
        qualityScore: 4,
        verified: true,
        createdAt: new Date('2026-10-28T01:00:00Z'),
      });
      await db.transaction(async (tx) => {
        await xp.awardXp(
          tx,
          {
            userId: b.userId,
            type: 'action_verified',
            amount: 50,
            refType: 'action',
            refId: actionId,
          },
          WEDNESDAY,
        );
      });
      expect((await domainOf(b.userId, domainA))?.verifiedActions).toBe(1);
      expect((await domainOf(b.userId, domainA))?.xp).toBe(38); // 50 * 0.75 = 37.5 -> 38
      expect((await domainOf(b.userId, domainB))?.xp).toBe(12);

      // ---- 4. Concurrent rewards for different modules, one user ---------------
      const c = await learner({ moduleCount: 2 });
      await Promise.all(
        c.moduleIds.map((moduleId) =>
          db.transaction((tx) =>
            xp.awardXp(
              tx,
              {
                userId: c.userId,
                type: 'module_read',
                amount: 20,
                refType: 'module',
                refId: moduleId,
              },
              WEDNESDAY,
            ),
          ),
        ),
      );
      const concurrent = await ledgerOf(c.userId);
      expect(concurrent.filter((row) => row.type === 'first_unbook')).toHaveLength(1);
      expect((await totalOf(c.userId))?.totalXp).toBe(
        concurrent.reduce((sum, row) => sum + row.amount, 0),
      );
      expect(concurrent.filter((row) => row.type === 'module_read')).toHaveLength(2);

      // ---- 5. Foreign user isolation ------------------------------------------
      const foreign = await learner({ moduleCount: 1, completedAt: null });
      await db.delete(schema.unbooks).where(eq(schema.unbooks.id, foreign.unbookId));
      await db.insert(schema.xpEvents).values({
        userId: foreign.userId,
        type: 'module_read',
        refType: 'module',
        refId: m1, // module owned by user A
        amount: 20,
      });
      const stranger = await engine.reconcileUserGame(foreign.userId, WEDNESDAY);
      expect(stranger.totalXp).toBe(20);
      expect(await domainOf(foreign.userId, domainA)).toBeUndefined();
      const tree = await queries.getSkillTree({ userId: foreign.userId }, WEDNESDAY);
      expect(JSON.stringify(tree)).not.toContain(m1);

      // ---- 6. Time zone: one instant, two local weeks --------------------------
      const instant = new Date('2026-10-25T12:00:00Z');
      const jakarta = await engine.reconcileUserGame(a.userId, instant);
      expect(jakarta.weekStart).toBe('2026-10-19');
      await db
        .update(schema.profiles)
        .set({ timezone: 'Pacific/Kiritimati' })
        .where(eq(schema.profiles.userId, a.userId));
      const kiritimati = await engine.reconcileUserGame(a.userId, instant);
      expect(kiritimati.weekStart).toBe('2026-10-26');

      // ---- 7. Streak + weekly freeze, mission bonus never fakes a day ----------
      const d = await learner({ joinedAt: new Date('2026-10-19T00:00:00Z'), moduleCount: 1 });
      await db.insert(schema.xpEvents).values([
        {
          userId: d.userId,
          type: 'module_read',
          refType: 'module',
          refId: d.moduleIds[0]!,
          amount: 20,
          createdAt: new Date('2026-10-19T03:00:00Z'),
        },
        {
          userId: d.userId,
          type: 'review_daily',
          refType: 'review',
          refId: randomUUID(),
          amount: 10,
          createdAt: new Date('2026-10-20T03:00:00Z'),
        },
      ]);
      const streak = await engine.reconcileUserGame(d.userId, new Date('2026-10-21T05:00:00Z'));
      expect(streak).toMatchObject({ currentStreak: 2, longestStreak: 2, streakFreezes: 1 });
      expect(streak.activeToday).toBe(false);

      // ---- 8. Read API reconciles lazily and exposes only safe fields ----------
      const summary = await queries.getGameSummary({ userId: a.userId }, WEDNESDAY);
      expect(summary.missions.map((row) => row.type)).toEqual(['learn', 'review', 'apply']);
      expect(summary.badges.some((row) => row.earned)).toBe(true);
      await expect(queries.getGameSummary({ userId: 'nope' })).rejects.toThrow('invalidUserId');
      expect(summary.today).toBe('2026-10-28');
      // Earlier steps reconciled this user at several instants, so only the shape is stable.
      expect(summary.lastActiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(summary.domainLevels.map((row) => row.id)).toEqual([domainA, domainB].sort());
      expect(summary.domainLevels.find((row) => row.id === domainA)).toMatchObject({
        name: 'Domain A',
        level: 'novice',
        xp: 61,
      });
      const fresh = await learner({ moduleCount: 1, completedAt: null });
      await db.delete(schema.unbooks).where(eq(schema.unbooks.id, fresh.unbookId));
      expect(await queries.getGameSummary({ userId: fresh.userId }, WEDNESDAY)).toMatchObject({
        totalXp: 0,
        today: '2026-10-28',
        lastActiveDate: null,
        activeToday: false,
        domainLevels: [],
      });

      // ---- 9. Quiz counts once per module even with a perfect bonus ------------
      const q = await learner({ moduleCount: 2, completedAt: null });
      const [q1, q2] = q.moduleIds as [string, string];
      const quiz = (type: string, refId: string, amount: number, at: string) => ({
        userId: q.userId,
        type,
        refType: 'module_quiz',
        refId,
        amount,
        createdAt: new Date(at),
      });
      await db
        .insert(schema.xpEvents)
        .values([
          quiz('quiz_pass', q1, 30, '2026-10-27T03:00:00Z'),
          quiz('quiz_perfect', q1, 10, '2026-10-27T03:00:00Z'),
          quiz('quiz_pass', q2, 30, '2026-10-27T04:00:00Z'),
        ]);
      await engine.reconcileUserGame(q.userId, WEDNESDAY);
      const qTree = await queries.getSkillTree({ userId: q.userId }, WEDNESDAY);
      const qDomain = qTree.interests
        .flatMap((row) => row.domains)
        .find((row) => row.id === domainA);
      expect(qDomain?.passedQuizzes).toBe(2);
      expect((await domainOf(q.userId, domainA))?.xp).toBe(54); // 23 + 8 + 23
      expect((await domainOf(q.userId, domainB))?.xp).toBe(16); // 7 + 2 + 7

      // ---- 10. Mission reward alone activates the day (PRD E8-04 AC1) ----------
      let missionUserId = randomUUID();
      const applyFixture = templates.find((row) => row.type === 'apply')!;
      for (let attempt = 0; attempt < 5000; attempt += 1) {
        const picked = expectedSelection(missionUserId, '2026-10-26').find(
          (row) => row.type === 'apply',
        );
        if (picked?.id === applyFixture.id) break;
        missionUserId = randomUUID();
      }
      expect(
        expectedSelection(missionUserId, '2026-10-26').find((row) => row.type === 'apply')?.id,
      ).toBe(applyFixture.id);
      const m = await learner({ moduleCount: 1, completedAt: null, userId: missionUserId });
      const [mm] = m.moduleIds as [string];
      // Not ready: no first-Unbook backfill, so the mission reward is the only XP.
      await db
        .update(schema.unbooks)
        .set({ status: 'generating' })
        .where(eq(schema.unbooks.id, m.unbookId));
      const mAction = randomUUID();
      await db.insert(schema.actions).values({
        id: mAction,
        userId: m.userId,
        moduleId: mm,
        title: 'Laporkan',
        status: 'planned',
      });
      await db.insert(schema.actionReports).values({
        actionId: mAction,
        whatIDid: 'x'.repeat(30),
        result: 'x'.repeat(30),
        reflection: '',
        qualityScore: 2,
        verified: false,
        createdAt: new Date('2026-10-28T01:00:00Z'),
      });
      const mState = await engine.reconcileUserGame(m.userId, WEDNESDAY);
      const reward = (await ledgerOf(m.userId)).filter((row) => row.type === 'weekly_mission');
      expect(reward).toHaveLength(1);
      expect(reward[0]).toMatchObject({ amount: applyFixture.xpReward, refType: 'mission' });
      // Only positive XP that day is a low-report mission reward: no module/quiz XP.
      expect((await ledgerOf(m.userId)).some((row) => row.type === 'action_verified')).toBe(false);
      expect(mState).toMatchObject({
        totalXp: applyFixture.xpReward,
        activeToday: true,
        currentStreak: 1,
        lastActiveDate: '2026-10-28',
      });
    } finally {
      // Delete only what this run created (cascades from users/unbooks/interests).
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
      await db.delete(schema.unbooks).where(inArray(schema.unbooks.id, unbookIds));
      await db.delete(schema.interests).where(eq(schema.interests.id, interestId));
      if (badgeIds.length)
        await db.delete(schema.badges).where(inArray(schema.badges.id, badgeIds));
      if (templateIds.length) {
        await db
          .delete(schema.missionTemplates)
          .where(inArray(schema.missionTemplates.id, templateIds));
      }
      await client.end();
      const shared = (globalThis as { unbookinDb?: { $client: { end: () => Promise<void> } } })
        .unbookinDb;
      await shared?.$client.end();
    }
  }, 60_000);
});
