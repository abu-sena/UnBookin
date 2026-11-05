import { expect } from '@playwright/test';
import { resolve } from 'node:path';

import { AUTH_DIR, E2E_PROVIDER_ORIGIN, readJournalSeed } from './config';
import type { Db } from './db';

/**
 * M7 mentor fixtures. The fake provider stays loopback only and the database
 * helpers only touch the fixture learner's own rows. No request body is ever
 * logged or stored.
 */

export const E2E_MENTOR_TASK = 'mentor_chat';
/** Placeholder model for the local test DB only; never a real model id. */
export const E2E_MENTOR_MODEL = 'fixture/m7-e2e-mentor-chat';
export const E2E_MENTOR_CONFIG_BACKUP_PATH = resolve(AUTH_DIR, 'mentor-task-config.json');

export type MentorMode = 'mentor-cite' | 'mentor-slow' | 'mentor-silent' | 'mentor-fail';

/** Switch the local fake provider (loopback only). Never touches the database. */
export async function setMentorProviderMode(mode: MentorMode): Promise<void> {
  const response = await fetch(`${E2E_PROVIDER_ORIGIN}/mode`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
  expect(response.status, 'mentor provider mode endpoint').toBe(200);
}

/** Number of chat completions the fake provider has served so far. */
export async function mentorProviderRequestCount(): Promise<number> {
  const response = await fetch(`${E2E_PROVIDER_ORIGIN}/mode`);
  const body = (await response.json()) as { requests: number };
  return body.requests;
}

/** Mentor messages used in the learner's current Jakarta month. */
export async function readMentorUsage(db: Db, userId: string): Promise<number> {
  const rows = await db<{ used: number }[]>`
    select coalesce((
      select mentor_messages_used from usage_counters
      where user_id = ${userId}
        and period = to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM')
    ), 0)::int as used
  `;
  return Number(rows[0]?.used ?? 0);
}

/** Overwrite the learner's mentor usage for the current Jakarta month. */
export async function setMentorUsage(db: Db, userId: string, used: number): Promise<void> {
  await db`
    insert into usage_counters (user_id, period, mentor_messages_used)
    values (${userId}, to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM'), ${used})
    on conflict (user_id, period) do update set mentor_messages_used = excluded.mentor_messages_used
  `;
}

/** Plan limit from the `plans` table, never hard-coded in the spec. */
export async function readFreeMentorLimit(db: Db): Promise<number> {
  const rows = await db<{ limit: number }[]>`
    select (limits->>'mentorMessagesPerMonth')::int as "limit"
    from plans where code = 'free'
  `;
  if (rows[0]?.limit === undefined) throw new Error('e2e: free plan mentor limit is missing.');
  return Number(rows[0].limit);
}

/** Remove every thread this fixture learner owns (messages cascade). */
export async function clearMentorThreads(db: Db, userId: string): Promise<void> {
  await db`delete from mentor_threads where user_id = ${userId}`;
}

export type MentorMessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: { chunkId: string; page: number | null }[] | null;
};

export async function readMentorMessages(db: Db, userId: string): Promise<MentorMessageRow[]> {
  return db<MentorMessageRow[]>`
    select m.id, m.role, m.content, m.citations
    from mentor_messages m
    join mentor_threads t on t.id = m.thread_id
    where t.user_id = ${userId}
    order by m.created_at asc, m.id asc
  `;
}

export async function readMentorThreadId(db: Db, userId: string): Promise<string | null> {
  const rows = await db<{ id: string }[]>`
    select id from mentor_threads where user_id = ${userId} order by created_at asc limit 1
  `;
  return rows[0]?.id ?? null;
}
export type ForeignMentorThread = { threadId: string; title: string };

/**
 * A mentor thread owned by the journal fixture's foreign user. Used to prove the
 * route answers 404 JSON for another user's thread without leaking its title.
 */
export async function createForeignMentorThread(db: Db): Promise<ForeignMentorThread> {
  const journal = readJournalSeed();
  const rows = await db<{ unbook_id: string }[]>`
    select m.unbook_id
    from actions a join modules m on m.id = a.module_id
    where a.id = ${journal.foreignActionId} and a.user_id = ${journal.foreignUserId}
    limit 1
  `;
  const unbookId = rows[0]?.unbook_id;
  if (!unbookId) throw new Error('e2e: foreign fixture Unbook is missing.');
  const title = `Percakapan rahasia asing ${journal.runId}`;
  const created = await db<{ id: string }[]>`
    insert into mentor_threads (user_id, unbook_id, title)
    values (${journal.foreignUserId}, ${unbookId}, ${title})
    returning id
  `;
  return { threadId: created[0]!.id, title };
}

export async function removeForeignMentorThread(db: Db, threadId: string): Promise<void> {
  await db`delete from mentor_threads where id = ${threadId}`;
}
