import 'server-only';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { userStats, xpEvents } from '@/db/schema';
import type * as schema from '@/db/schema';
import { reconcileGame } from './engine';
import { acquireGameLock } from './lock';

type Database = PostgresJsDatabase<typeof schema>;
/** The transaction handle passed to `db.transaction(...)`. */
export type XpTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type AwardXpInput = {
  userId: string;
  type: string;
  amount: number;
  refType: string;
  refId: string;
  domainId?: string | null;
};

export type AwardXpResult = { awarded: boolean; amount: number };

/**
 * Record one XP event idempotently on (user_id, type, ref_type, ref_id) and, only
 * when the event was new, add it to `user_stats.total_xp`. The caller must pass
 * an open transaction so the event and the total commit together.
 *
 * All game writes for the user are serialized by an advisory lock taken before
 * the event insert. The derived engine then recomputes totals, streak, domains,
 * badges and missions in the SAME transaction. `result.amount` always mirrors the
 * input amount; derived bonuses are never folded into this return value.
 */
export async function awardXp(tx: XpTransaction, input: AwardXpInput): Promise<AwardXpResult> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('invalidXpAmount');
  }

  await acquireGameLock(tx, input.userId);

  const [inserted] =
    (await tx
      .insert(xpEvents)
      .values({
        userId: input.userId,
        type: input.type,
        amount: input.amount,
        domainId: input.domainId ?? null,
        refType: input.refType,
        refId: input.refId,
      })
      .onConflictDoNothing({
        target: [xpEvents.userId, xpEvents.type, xpEvents.refType, xpEvents.refId],
      })
      .returning({ id: xpEvents.id })) ?? [];

  if (!inserted) return { awarded: false, amount: 0 };

  await tx
    .insert(userStats)
    .values({ userId: input.userId, totalXp: input.amount })
    .onConflictDoUpdate({
      target: userStats.userId,
      set: {
        totalXp: sql`${userStats.totalXp} + ${input.amount}`,
        updatedAt: new Date(),
      },
    })
    .then(() => undefined);

  await reconcileGame(tx, input.userId);

  return { awarded: true, amount: input.amount };
}

/** RFC 4122 DNS namespace; keeps the derived id stable across deploys. */
const UUID_NAMESPACE_DNS = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');

/**
 * Deterministic UUIDv5-style id from SHA-1 for `xp_events.ref_id` (a uuid
 * column). The same user and local date always produce the same id, so the
 * daily review reward can be inserted at most once per local day.
 */
export function dailyRefId(userId: string, localDate: string): string {
  if (!userId || !localDate) throw new Error('invalidDailyRef');
  const digest = createHash('sha1')
    .update(UUID_NAMESPACE_DNS)
    .update(`${userId}:${localDate}`, 'utf8')
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
