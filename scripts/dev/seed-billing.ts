#!/usr/bin/env node
/**
 * M8 e2e fixture for billing and BYOK. Builds on the learning seed and, inside
 * the local TEST database only, resets the learner's `payments`,
 * `subscriptions` and `byok_keys` rows so every run starts from the free plan
 * with no saved key.
 *
 * No order, subscription or key is created here: the spec does that through the
 * real UI or its helpers. Both `seed` and `--cleanup` perform the same reset, so
 * an earlier run can never leak a paid period into a later one. Every entry
 * point asserts a local host and a database name containing "test". This script
 * never reads `.env.local`.
 *
 * Usage: tsx scripts/dev/seed-billing.ts [--cleanup]
 */

import postgres from 'postgres';

import { readLearningSeed } from '../../tests/e2e/support/config';
import { assertLocalTestDatabase } from '../../tests/e2e/support/guards';

type Sql = ReturnType<typeof postgres>;

function openSql(): Sql {
  const url = assertLocalTestDatabase(process.env.DATABASE_URL);
  return postgres(url, { max: 2, onnotice: () => undefined });
}

async function reset(sql: Sql): Promise<void> {
  const learning = readLearningSeed();
  await sql`delete from byok_keys where user_id = ${learning.userId}`;
  await sql`delete from payments where user_id = ${learning.userId}`;
  await sql`delete from subscriptions where user_id = ${learning.userId}`;
  console.log(`Reset billing fixture for learner ${learning.runId}.`);
}

async function main(): Promise<void> {
  const sql = openSql();
  try {
    await reset(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const cleanupMode = process.argv.slice(2).includes('--cleanup');
main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(
      `${cleanupMode ? 'cleanup' : 'seed'} failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
    process.exit(1);
  },
);
