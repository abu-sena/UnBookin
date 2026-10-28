import 'server-only';
import { and, gt, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { resolveTimeZone } from '@/lib/billing/source-quota';
import { reconcileUserGame } from '@/lib/game/engine';
import { isMondayMidnightLocal } from '@/lib/game/weekly';
import { inngest } from './client';

const PROFILE_BATCH = 200;

/**
 * Onboarded users whose local clock is Monday midnight. Keyset pagination keeps
 * memory bounded; only ids/time zones are read, never profile content.
 */
async function listMondayUsers(now: Date): Promise<string[]> {
  const targets: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    const rows = await db
      .select({ userId: profiles.userId, timezone: profiles.timezone })
      .from(profiles)
      .where(
        cursor
          ? and(isNotNull(profiles.onboardedAt), gt(profiles.userId, cursor))
          : isNotNull(profiles.onboardedAt),
      )
      .orderBy(profiles.userId)
      .limit(PROFILE_BATCH);
    for (const row of rows) {
      if (isMondayMidnightLocal(now, resolveTimeZone(row.timezone))) {
        targets.push(row.userId);
      }
    }
    if (rows.length < PROFILE_BATCH) break;
    cursor = rows[rows.length - 1]!.userId;
  }
  return targets;
}

/**
 * E8-06: hourly tick that reconciles users at their local Monday 00:00. Lazy
 * reconciliation in queries stays the fallback when Inngest is not configured.
 */
export const weeklyMissions = inngest.createFunction(
  {
    id: 'weekly-missions',
    triggers: [{ cron: '0 * * * *' }],
    retries: 2,
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    // Stamped once in a memoized step so every retry sees the same tick.
    const tick = await step.run('tick', () => new Date().toISOString());
    const now = new Date(tick);
    const targets = await step.run('select-local-monday', () => listMondayUsers(now));
    for (const userId of targets) {
      await step.run(`reconcile-${userId}`, async () => {
        await reconcileUserGame(userId, now);
        return true;
      });
    }
    return { reconciled: targets.length };
  },
);
