#!/usr/bin/env node
/**
 * M6 e2e fixture for the journal. Builds on the learning seed (same learner,
 * session and ready Unbook) and adds, inside the local TEST database only:
 *
 *  - six planned actions on module 2 (extend / skip / report, light + dark),
 *  - module-domain weights 0.75 / 0.25 so domain XP is positive,
 *  - one foreign user with its own Unbook and action (404 isolation check),
 *  - a placeholder `action_feedback` task config pointing at the fake
 *    provider; the previous row is saved to `tests/e2e/.auth` (ignored by git)
 *    BEFORE any change and restored by `--cleanup`.
 *
 * Every entry point asserts a local host and a database name containing
 * "test". Only rows created here are removed. Never reads `.env.local`.
 *
 * Usage: tsx scripts/dev/seed-journal.ts [--cleanup]
 */

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import postgres from 'postgres';

import {
  AUTH_DIR,
  E2E_FEEDBACK_MODEL,
  JOURNAL_CONFIG_BACKUP_PATH,
  JOURNAL_FILE_PATH,
  readLearningSeed,
  type ColorSchemeName,
  type JournalActionFixture,
  type JournalSeed,
} from '../../tests/e2e/support/config';
import { assertLocalTestDatabase } from '../../tests/e2e/support/guards';

type Sql = ReturnType<typeof postgres>;

const TASK = 'action_feedback';
const DAY_MS = 24 * 60 * 60 * 1000;
/** 2026-03-15 17:30 UTC is 16 March 00:30 in Asia/Jakarta: UTC and Jakarta disagree. */
const FIXED_DUE_ISO = '2026-03-15T17:30:00.000Z';

function openSql(): Sql {
  const url = assertLocalTestDatabase(process.env.DATABASE_URL);
  return postgres(url, { max: 2, onnotice: () => undefined });
}

function jakartaDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

type TaskRow = Record<string, unknown>;

/** Save the previous task row once; a leftover backup from a failed run wins. */
async function installTaskConfig(sql: Sql): Promise<void> {
  if (!existsSync(JOURNAL_CONFIG_BACKUP_PATH)) {
    const rows = await sql<TaskRow[]>`select * from ai_task_configs where task = ${TASK}`;
    await mkdir(dirname(JOURNAL_CONFIG_BACKUP_PATH), { recursive: true });
    await writeFile(
      JOURNAL_CONFIG_BACKUP_PATH,
      `${JSON.stringify({ previous: rows[0] ?? null })}\n`,
      'utf8',
    );
  }
  await sql`
    insert into ai_task_configs (task, model, fallback_model, temperature, max_output_tokens, is_active)
    values (${TASK}, ${E2E_FEEDBACK_MODEL}, null, 0.2, 600, true)
    on conflict (task) do update set
      model = excluded.model, fallback_model = null, temperature = 0.2,
      max_output_tokens = 600, is_active = true, updated_at = now()
  `;
}

async function restoreTaskConfig(sql: Sql): Promise<void> {
  if (!existsSync(JOURNAL_CONFIG_BACKUP_PATH)) return;
  const { previous } = JSON.parse(await readFile(JOURNAL_CONFIG_BACKUP_PATH, 'utf8')) as {
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
      where task = ${TASK}
    `;
  } else {
    await sql`delete from ai_task_configs where task = ${TASK} and model = ${E2E_FEEDBACK_MODEL}`;
  }
  await rm(JOURNAL_CONFIG_BACKUP_PATH, { force: true });
}

async function insertAction(
  sql: Sql,
  input: { userId: string; moduleId: string; title: string; dueAt: Date; status?: string },
): Promise<JournalActionFixture> {
  const rows = await sql<{ id: string }[]>`
    insert into actions (user_id, module_id, title, description, due_at, status)
    values (${input.userId}, ${input.moduleId}, ${input.title},
            ${'Langkah uji E2E untuk jurnal.'}, ${input.dueAt}, ${input.status ?? 'planned'})
    returning id
  `;
  return { id: rows[0]!.id, title: input.title };
}

async function seed(): Promise<void> {
  const sql = openSql();
  const runKey = randomBytes(4).toString('hex');
  const learning = readLearningSeed();
  let foreignUserId: string | null = null;
  try {
    // Install the config first so cleanup can always restore it, even on later failure.
    await installTaskConfig(sql);

    const unbooks = await sql<{ interest_id: string }[]>`
      select interest_id from unbooks where id = ${learning.unbookId} and user_id = ${learning.userId}
    `;
    const interestId = unbooks[0]?.interest_id;
    if (!interestId) throw new Error('Learning fixture Unbook is missing.');
    const domains = await sql<{ id: string; slug: string }[]>`
      select id, slug from domains where interest_id = ${interestId} order by sort_order asc
    `;
    if (domains.length < 2) throw new Error('Fixture interest needs two domains.');
    const domainIds = domains.map((domain) => domain.id);

    const moduleId = learning.moduleIds[1];
    if (!moduleId) throw new Error('Fixture needs at least two modules.');
    const moduleRows = await sql<
      { title: string }[]
    >`select title from modules where id = ${moduleId}`;
    const foreignModuleTitle = `Modul asing ${runKey}`;

    // Deterministic 0.75 / 0.25 weights on module 2 (module 1 stays as the M5 flow left it).
    await sql`delete from module_domains where module_id = ${moduleId}`;
    await sql`
      insert into module_domains (module_id, domain_id, confidence)
      values (${moduleId}, ${domainIds[0]!}, 0.75), (${moduleId}, ${domainIds[1]!}, 0.25)
    `;

    const now = Date.now();
    const fixedDue = new Date(FIXED_DUE_ISO);
    const actions = {} as JournalSeed['actions'];
    for (const scheme of ['light', 'dark'] as ColorSchemeName[]) {
      actions[scheme] = {
        extend: await insertAction(sql, {
          userId: learning.userId,
          moduleId,
          title: `Aksi perpanjang ${scheme} ${runKey}`,
          dueAt: fixedDue,
        }),
        skip: await insertAction(sql, {
          userId: learning.userId,
          moduleId,
          title: `Aksi lewati ${scheme} ${runKey}`,
          dueAt: new Date(now + 3 * DAY_MS),
        }),
        report: await insertAction(sql, {
          userId: learning.userId,
          moduleId,
          title: `Aksi laporan ${scheme} ${runKey}`,
          dueAt: new Date(now + 4 * DAY_MS),
        }),
      };
    }

    // Foreign user with its own ready Unbook + action. Never a real user's data.
    const foreignEmail = `e2e-foreign-${learning.runId}-${runKey}@example.test`;
    const users = await sql<{ id: string }[]>`
      insert into users (name, email) values (${'E2E Foreign'}, ${foreignEmail}) returning id
    `;
    foreignUserId = users[0]!.id;
    await sql`
      insert into profiles (user_id, display_name, timezone, onboarded_at)
      values (${foreignUserId}, 'E2E Foreign', 'Asia/Jakarta', now())
    `;
    const foreignUnbook = await sql<{ id: string }[]>`
      insert into unbooks (user_id, title, interest_id, status, module_count, completed_at)
      values (${foreignUserId}, ${`Unbook asing ${runKey}`}, ${interestId}, 'ready', 1, now())
      returning id
    `;
    const foreignModule = await sql<{ id: string }[]>`
      insert into modules (unbook_id, sort_order, title, summary)
      values (${foreignUnbook[0]!.id}, 0, ${foreignModuleTitle}, ${'Ringkasan rahasia asing'})
      returning id
    `;
    const foreignTitle = `Aksi rahasia asing ${runKey}`;
    const foreignAction = await insertAction(sql, {
      userId: foreignUserId,
      moduleId: foreignModule[0]!.id,
      title: foreignTitle,
      dueAt: new Date(now + 2 * DAY_MS),
    });

    const result: JournalSeed = {
      runId: runKey,
      userId: learning.userId,
      foreignUserId,
      foreignActionId: foreignAction.id,
      foreignTitle,
      foreignModuleTitle,
      interestId,
      domainIds,
      fixedDueIso: FIXED_DUE_ISO,
      fixedDueText: jakartaDate(FIXED_DUE_ISO),
      actions,
    };
    void moduleRows;
    await mkdir(AUTH_DIR, { recursive: true });
    await writeFile(JOURNAL_FILE_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`Seeded journal fixture ${runKey}: ${Object.keys(actions).length * 3} actions.`);
  } catch (error) {
    await removeForeign(sql, foreignUserId).catch(() => undefined);
    await restoreTaskConfig(sql).catch(() => undefined);
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function removeForeign(sql: Sql, userId: string | null): Promise<void> {
  if (!userId) return;
  await sql`delete from ai_calls where user_id = ${userId}`;
  await sql`delete from users where id = ${userId}`;
}

async function cleanup(): Promise<void> {
  const sql = openSql();
  try {
    let fixture: JournalSeed | null = null;
    try {
      fixture = JSON.parse(await readFile(JOURNAL_FILE_PATH, 'utf8')) as JournalSeed;
    } catch {
      fixture = null;
    }
    // Only fixture-owned ids: the foreign user and the learner's fixture actions.
    if (fixture) {
      await removeForeign(sql, fixture.foreignUserId);
      const ids = Object.values(fixture.actions).flatMap((group) =>
        Object.values(group).map((action) => action.id),
      );
      if (ids.length > 0) {
        await sql`delete from actions where id in ${sql(ids)} and user_id = ${fixture.userId}`;
      }
      await rm(JOURNAL_FILE_PATH, { force: true });
    }
    await restoreTaskConfig(sql);
    console.log('Removed journal fixture and restored action_feedback config.');
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
