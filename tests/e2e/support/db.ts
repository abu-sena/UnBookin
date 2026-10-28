import postgres from 'postgres';

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
