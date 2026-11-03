import postgres from 'postgres';

import { MAX_LEVEL, levelForXp, xpForLevel } from '../../../src/lib/game/levels';
import { MODULE_READ } from '../../../src/lib/game/xp-rules';
import { E2E_DATABASE_URL } from './config';
import { assertLocalTestDatabase } from './guards';

export type Db = ReturnType<typeof postgres>;

export function openDb(): Db {
  return postgres(assertLocalTestDatabase(E2E_DATABASE_URL), { max: 4 });
}

export type CorrectAnswer = {
  id: string;
  type: string;
  optionIndexes: number[];
  modelAnswer: string | null;
};

type QuestionRow = {
  id: string;
  type: string;
  correct: unknown;
};

function optionIndexes(correct: unknown): number[] {
  if (typeof correct === 'number') return [correct];
  if (!Array.isArray(correct)) return [];
  return correct.filter((value): value is number => typeof value === 'number');
}

export async function readQuizAnswers(db: Db, quizId: string): Promise<CorrectAnswer[]> {
  const rows = await db<QuestionRow[]>`
    select id, type, correct
    from quiz_questions
    where quiz_id = ${quizId}
    order by sort_order asc, id asc
  `;
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    optionIndexes: optionIndexes(row.correct),
    modelAnswer: typeof row.correct === 'string' ? row.correct : null,
  }));
}

export async function readTotalXp(db: Db, userId: string): Promise<number> {
  const rows = await db<{ total_xp: number }[]>`
    select total_xp from user_stats where user_id = ${userId}
  `;
  return Number(rows[0]?.total_xp ?? 0);
}

export async function readXpEvents(db: Db, userId: string) {
  return db<{ type: string; amount: number }[]>`
    select type, amount from xp_events where user_id = ${userId} order by created_at asc
  `;
}

export async function makeCardsDueNow(db: Db, userId: string): Promise<void> {
  await db`update card_states set due_at = now() where user_id = ${userId}`;
}

export async function readDueCardCount(db: Db, userId: string): Promise<number> {
  const rows = await db<{ count: number }[]>`
    select count(*)::int as count
    from card_states
    where user_id = ${userId} and due_at <= now()
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function readModuleStatus(
  db: Db,
  userId: string,
  moduleId: string,
): Promise<string | null> {
  const rows = await db<{ status: string }[]>`
    select status from module_progress where user_id = ${userId} and module_id = ${moduleId}
  `;
  return rows[0]?.status ?? null;
}

/** Exact per-type ledger so additional awards are never silently ignored. */
export type LedgerMap = Record<string, { count: number; amount: number }>;

export async function readLedgerMap(db: Db, userId: string): Promise<LedgerMap> {
  const rows = await db<{ type: string; count: number; amount: number }[]>`
    select type, count(*)::int as count, coalesce(sum(amount), 0)::int as amount
    from xp_events where user_id = ${userId} group by type
  `;
  return Object.fromEntries(
    rows.map((row) => [row.type, { count: row.count, amount: row.amount }]),
  );
}

/** Weekly mission reward actually granted (template choice is hashed per user/week). */
export async function readMissionXp(db: Db, userId: string): Promise<number> {
  const rows = await db<{ amount: number }[]>`
    select coalesce(sum(amount), 0)::int as amount
    from xp_events where user_id = ${userId} and type = 'weekly_mission'
  `;
  return Number(rows[0]?.amount ?? 0);
}

/** Completed mission rewards, to cross-check that mission XP is never phantom. */
export async function readCompletedMissionReward(db: Db, userId: string): Promise<number> {
  const rows = await db<{ reward: number }[]>`
    select coalesce(sum(t.xp_reward), 0)::int as reward
    from user_missions m join mission_templates t on t.id = m.template_id
    where m.user_id = ${userId} and m.completed_at is not null
  `;
  return Number(rows[0]?.reward ?? 0);
}

export type ReportRow = {
  id: string;
  quality_score: number;
  verified: boolean;
  reflection: string;
  evidence_url: string | null;
};

export async function readReports(db: Db, actionId: string): Promise<ReportRow[]> {
  return db<ReportRow[]>`
    select id, quality_score, verified, reflection, evidence_url
    from action_reports where action_id = ${actionId} order by created_at asc, id asc
  `;
}

export async function readActionRow(db: Db, actionId: string) {
  const rows = await db<{ status: string; due_at: Date | null; user_id: string }[]>`
    select status, due_at, user_id from actions where id = ${actionId}
  `;
  return rows[0] ?? null;
}

export async function readUserStats(db: Db, userId: string) {
  const rows = await db<
    { total_xp: number; level: number; current_streak: number; streak_freezes: number }[]
  >`select total_xp, level, current_streak, streak_freezes from user_stats where user_id = ${userId}`;
  return rows[0] ?? null;
}

export async function readDomainProgress(db: Db, userId: string) {
  return db<{ domain_id: string; xp: number; level: string; verified_actions: number }[]>`
    select domain_id, xp, level, verified_actions from domain_progress
    where user_id = ${userId} order by xp desc, domain_id asc
  `;
}

/** Poll the DB instead of sleeping; returns the last value when the deadline passes. */
export async function waitForCondition<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/* ---------------------------------------------------------------------------
 * M6 game UI helpers. Every write is scoped to the fixture learner (user id
 * filter + ownership check) and runs against the guarded local test database
 * opened by `openDb`. `user_stats` is never written: the engine overwrites it.
 * ------------------------------------------------------------------------- */

const MODULE_READ_XP = MODULE_READ;
/** Largest remaining gap to the next level that a level-celebration seed may leave. */
export const LEVEL_GAP_MAX = 50;

export async function readLedgerTotal(db: Db, userId: string): Promise<number> {
  const rows = await db<{ total: number }[]>`
    select coalesce(sum(amount), 0)::int as total from xp_events where user_id = ${userId}
  `;
  return Number(rows[0]?.total ?? 0);
}

/** Streak stats with the stored local date as text (no host-zone Date parsing). */
export async function readStreakStats(db: Db, userId: string) {
  const rows = await db<
    {
      current_streak: number;
      longest_streak: number;
      streak_freezes: number;
      last_active_date: string | null;
    }[]
  >`
    select current_streak, longest_streak, streak_freezes, last_active_date::text as last_active_date
    from user_stats where user_id = ${userId}
  `;
  return rows[0] ?? null;
}

export async function readBadgeCatalogCount(db: Db): Promise<number> {
  const rows = await db<{ count: number }[]>`select count(*)::int as count from badges`;
  return Number(rows[0]?.count ?? 0);
}

/** First `limit` catalog badges in the order the page renders them, with earned flag. */
export async function readBadgeGrid(db: Db, userId: string, limit: number) {
  return db<{ name: string; earned: boolean }[]>`
    select b.name as name, (ub.id is not null) as earned
    from badges b
    left join user_badges ub on ub.badge_id = b.id and ub.user_id = ${userId}
    order by b.created_at asc, b.slug asc
    limit ${limit}
  `;
}

export async function readInterestName(db: Db, interestId: string): Promise<string> {
  const rows = await db<{ name: string }[]>`select name from interests where id = ${interestId}`;
  if (!rows[0]) throw new Error('E2E helper: fixture interest is missing.');
  return rows[0].name;
}

export async function readInterestDomains(db: Db, userId: string, interestId: string) {
  return db<{ id: string; name: string; level: string }[]>`
    select d.id as id, d.name as name, coalesce(p.level::text, 'novice') as level
    from domains d
    left join domain_progress p on p.domain_id = d.id and p.user_id = ${userId}
    where d.interest_id = ${interestId}
    order by d.sort_order asc, d.name asc
  `;
}

export async function readDomainNames(db: Db, domainIds: string[]): Promise<Map<string, string>> {
  if (domainIds.length === 0) return new Map();
  const rows = await db<{ id: string; name: string }[]>`
    select id, name from domains where id in ${db(domainIds)}
  `;
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Weekly missions of the newest week this learner has rows for, in template type order. */
export async function readWeeklyMissions(db: Db, userId: string) {
  return db<
    {
      title: string;
      type: string;
      target: number;
      progress: number;
      xp_reward: number;
      completed: boolean;
    }[]
  >`
    select t.title as title, t.type::text as type, t.target as target,
           least(m.progress, t.target)::int as progress, t.xp_reward as xp_reward,
           (m.completed_at is not null) as completed
    from user_missions m
    join mission_templates t on t.id = m.template_id
    where m.user_id = ${userId}
      and m.week_start = (select max(week_start) from user_missions where user_id = ${userId})
    order by t.type asc, t.title asc
  `;
}

export type DomainDetailRow = {
  name: string;
  xp: number;
  level: string;
  verifiedActions: number;
  passedQuizzes: number;
  modules: { id: string; title: string; unbookId: string }[];
  actions: { id: string; title: string }[];
};

/** What the DomainDrawer must show for one domain of this learner (mirrors getSkillTree). */
export async function readDomainDetail(
  db: Db,
  userId: string,
  domainId: string,
): Promise<DomainDetailRow> {
  const domainRows = await db<{ name: string }[]>`select name from domains where id = ${domainId}`;
  if (!domainRows[0]) throw new Error('E2E helper: fixture domain is missing.');
  const progress = await db<{ xp: number; level: string; verified_actions: number }[]>`
    select xp, level::text as level, verified_actions from domain_progress
    where user_id = ${userId} and domain_id = ${domainId}
  `;
  const quizzes = await db<{ count: number }[]>`
    select count(distinct x.ref_id)::int as count
    from xp_events x
    join modules m on m.id = x.ref_id
    join module_domains md on md.module_id = m.id
    join unbooks u on u.id = m.unbook_id
    where x.user_id = ${userId} and x.type = 'quiz_pass'
      and u.user_id = ${userId} and md.domain_id = ${domainId}
  `;
  const moduleRows = await db<{ id: string; title: string; unbook_id: string }[]>`
    select distinct m.id as id, m.title as title, m.unbook_id as unbook_id
    from module_domains md
    join modules m on m.id = md.module_id
    join unbooks u on u.id = m.unbook_id
    where md.domain_id = ${domainId} and u.user_id = ${userId} and u.status = 'ready'
  `;
  const actionRows = await db<{ id: string; title: string }[]>`
    select distinct a.id as id, a.title as title
    from action_reports r
    join actions a on a.id = r.action_id
    join modules m on m.id = a.module_id
    join module_domains md on md.module_id = m.id
    join unbooks u on u.id = m.unbook_id
    where a.user_id = ${userId} and r.verified = true
      and u.user_id = ${userId} and u.status = 'ready' and md.domain_id = ${domainId}
  `;
  return {
    name: domainRows[0].name,
    xp: Number(progress[0]?.xp ?? 0),
    level: progress[0]?.level ?? 'novice',
    verifiedActions: Number(progress[0]?.verified_actions ?? 0),
    passedQuizzes: Number(quizzes[0]?.count ?? 0),
    modules: moduleRows.map((row) => ({ id: row.id, title: row.title, unbookId: row.unbook_id })),
    actions: actionRows.map((row) => ({ id: row.id, title: row.title })),
  };
}

async function assertOwnedModule(db: Db, userId: string, moduleId: string): Promise<void> {
  const rows = await db`
    select 1 from modules m join unbooks u on u.id = m.unbook_id
    where m.id = ${moduleId} and u.user_id = ${userId}
  `;
  if (rows.length === 0) throw new Error('E2E helper: module is not owned by the fixture learner.');
}

async function assertOwnedUnbook(db: Db, userId: string, unbookId: string): Promise<void> {
  const rows = await db`select 1 from unbooks where id = ${unbookId} and user_id = ${userId}`;
  if (rows.length === 0) throw new Error('E2E helper: Unbook is not owned by the fixture learner.');
}

/** One additional planned action on a module the learner owns. */
export async function insertPlannedAction(
  db: Db,
  input: { userId: string; moduleId: string; title: string; dueAt: Date },
): Promise<{ id: string; title: string }> {
  await assertOwnedModule(db, input.userId, input.moduleId);
  const rows = await db<{ id: string }[]>`
    insert into actions (user_id, module_id, title, description, due_at, status)
    values (${input.userId}, ${input.moduleId}, ${input.title},
            ${'Langkah uji E2E untuk perayaan level.'}, ${input.dueAt}, 'planned')
    returning id
  `;
  return { id: rows[0]!.id, title: input.title };
}

/** A ready Unbook owned by the learner, used only to host fixture modules. */
export async function createFixtureUnbook(
  db: Db,
  input: { userId: string; interestId: string; title: string },
): Promise<string> {
  const users = await db`select 1 from users where id = ${input.userId}`;
  if (users.length === 0) throw new Error('E2E helper: fixture learner is missing.');
  const rows = await db<{ id: string }[]>`
    insert into unbooks (user_id, title, interest_id, status, module_count, completed_at)
    values (${input.userId}, ${input.title}, ${input.interestId}, 'ready', 0, now())
    returning id
  `;
  return rows[0]!.id;
}

/**
 * Legal XP only: each fresh module is marked read and gets exactly one
 * `module_read` event (20 XP, refType `module`, refId = the new module id, so
 * the unique ledger key can never collide). Returns the XP added.
 */
export async function addReadModulesWithXp(
  db: Db,
  input: { userId: string; unbookId: string; count: number },
): Promise<number> {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 40) {
    throw new Error('E2E helper: module count must be between 1 and 40.');
  }
  await assertOwnedUnbook(db, input.userId, input.unbookId);
  await db.begin(async (tx) => {
    const sort = await tx<{ next: number }[]>`
      select coalesce(max(sort_order) + 1, 0)::int as next from modules where unbook_id = ${input.unbookId}
    `;
    let order = Number(sort[0]?.next ?? 0);
    for (let index = 0; index < input.count; index += 1) {
      const created = await tx<{ id: string }[]>`
        insert into modules (unbook_id, sort_order, title, summary)
        values (${input.unbookId}, ${order}, ${`Modul perayaan ${order + 1}`}, ${'Modul uji E2E.'})
        returning id
      `;
      const moduleId = created[0]!.id;
      order += 1;
      await tx`
        insert into module_progress (user_id, module_id, status, read_at)
        values (${input.userId}, ${moduleId}, 'read', now())
      `;
      await tx`
        insert into xp_events (user_id, type, amount, ref_type, ref_id)
        values (${input.userId}, 'module_read', ${MODULE_READ_XP}, 'module', ${moduleId})
      `;
    }
    await tx`
      update unbooks set module_count = module_count + ${input.count} where id = ${input.unbookId}
    `;
  });
  return input.count * MODULE_READ_XP;
}

export type CelebrationSeedPlan = { threshold: number; gap: number; modules: number };

/**
 * How many 20 XP module reads bring `totalXp` below the next player-level
 * threshold with a remaining gap of 1..50 XP. Pure; uses the real level curve.
 */
export function planCelebrationSeed(totalXp: number): CelebrationSeedPlan {
  const level = levelForXp(totalXp);
  if (level >= MAX_LEVEL) throw new Error('E2E helper: learner is already at the level cap.');
  const threshold = xpForLevel(level + 1);
  const gap = threshold - totalXp;
  const modules = gap <= LEVEL_GAP_MAX ? 0 : Math.ceil((gap - LEVEL_GAP_MAX) / MODULE_READ_XP);
  return { threshold, gap, modules };
}
