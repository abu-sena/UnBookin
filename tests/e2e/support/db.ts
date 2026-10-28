import postgres from 'postgres';

import { E2E_DATABASE_URL } from './config';

export type Db = ReturnType<typeof postgres>;

export function openDb(): Db {
  return postgres(E2E_DATABASE_URL, { max: 4 });
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
