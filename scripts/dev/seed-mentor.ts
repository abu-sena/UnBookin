#!/usr/bin/env node
/**
 * M7 e2e fixture for the mentor. Builds on the learning and journal seeds and,
 * inside the local TEST database only:
 *
 *  - installs a placeholder `mentor_chat` task config pointing at the fake
 *    provider's fixture model (never a real model id); the previous row is
 *    saved to `tests/e2e/.auth` (ignored by git) BEFORE any change and restored
 *    by `--cleanup`.
 *
 * No thread, message or usage row is created here: the spec creates them
 * through the real UI and its helpers reset them per theme. Every entry point
 * asserts a local host and a database name containing "test". Never reads
 * `.env.local`.
 *
 * Usage: tsx scripts/dev/seed-mentor.ts [--cleanup]
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import postgres from 'postgres';

import { readLearningSeed } from '../../tests/e2e/support/config';
import { assertLocalTestDatabase } from '../../tests/e2e/support/guards';
import {
  E2E_MENTOR_CONFIG_BACKUP_PATH,
  E2E_MENTOR_MODEL,
  E2E_MENTOR_TASK,
} from '../../tests/e2e/support/mentor';

type Sql = ReturnType<typeof postgres>;
type TaskRow = Record<string, unknown>;

function openSql(): Sql {
  const url = assertLocalTestDatabase(process.env.DATABASE_URL);
  return postgres(url, { max: 2, onnotice: () => undefined });
}

/** Save the previous task row once; a leftover backup from a failed run wins. */
async function installTaskConfig(sql: Sql): Promise<void> {
  if (!existsSync(E2E_MENTOR_CONFIG_BACKUP_PATH)) {
    const rows = await sql<TaskRow[]>`
      select * from ai_task_configs where task = ${E2E_MENTOR_TASK}
    `;
    await mkdir(dirname(E2E_MENTOR_CONFIG_BACKUP_PATH), { recursive: true });
    await writeFile(
      E2E_MENTOR_CONFIG_BACKUP_PATH,
      `${JSON.stringify({ previous: rows[0] ?? null })}\n`,
      'utf8',
    );
  }
  await sql`
    insert into ai_task_configs (task, model, fallback_model, temperature, max_output_tokens, is_active)
    values (${E2E_MENTOR_TASK}, ${E2E_MENTOR_MODEL}, null, 0.3, 1200, true)
    on conflict (task) do update set
      model = excluded.model, fallback_model = null, temperature = 0.3,
      max_output_tokens = 1200, is_active = true, updated_at = now()
  `;
}

async function restoreTaskConfig(sql: Sql): Promise<void> {
  if (!existsSync(E2E_MENTOR_CONFIG_BACKUP_PATH)) return;
  const { previous } = JSON.parse(await readFile(E2E_MENTOR_CONFIG_BACKUP_PATH, 'utf8')) as {
    previous: {
      model: string;
      fallback_model: string | null;
      temperature: number;
      max_output_tokens: number;
      is_active: boolean;
      updated_at: string;
    } | null;
  };
  if (previous) {
    await sql`
      update ai_task_configs set
        model = ${previous.model},
        fallback_model = ${previous.fallback_model},
        temperature = ${previous.temperature},
        max_output_tokens = ${previous.max_output_tokens},
        is_active = ${previous.is_active},
        updated_at = ${previous.updated_at}
      where task = ${E2E_MENTOR_TASK}
    `;
  } else {
    await sql`
      delete from ai_task_configs where task = ${E2E_MENTOR_TASK} and model = ${E2E_MENTOR_MODEL}
    `;
  }
  await rm(E2E_MENTOR_CONFIG_BACKUP_PATH, { force: true });
}

async function seed(): Promise<void> {
  const sql = openSql();
  try {
    const learning = readLearningSeed();
    await installTaskConfig(sql);
    console.log(`Seeded mentor fixture for learner ${learning.runId}: task ${E2E_MENTOR_TASK}.`);
  } catch (error) {
    await restoreTaskConfig(sql).catch(() => undefined);
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function cleanup(): Promise<void> {
  const sql = openSql();
  try {
    await restoreTaskConfig(sql);
    console.log(`Removed mentor fixture and restored ${E2E_MENTOR_TASK} config.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const cleanupMode = process.argv.slice(2).includes('--cleanup');
(cleanupMode ? cleanup() : seed()).then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'unknown error');
    process.exit(1);
  },
);