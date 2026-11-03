import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

/**
 * REAL-DB check for mentor data. SKIPPED unless MENTOR_DB_URL is set.
 * Safety: the URL must be local and its database name must contain "test".
 * Every fixture uses fresh UUIDs and only those ids are removed in `finally`.
 */
const URL_VALUE = process.env.MENTOR_DB_URL ?? '';

function assertLocalTestDatabase(value: string): void {
  const parsed = new URL(value);
  const host = parsed.hostname;
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['127.0.0.1', 'localhost'].includes(host) || !name.includes('test')) {
    throw new Error('MENTOR_DB_URL must be a local database whose name includes "test".');
  }
}

const OTHER_USER_ID = 'a1b2c3d4-0000-4000-8000-0000000000ff';

describe.skipIf(!URL_VALUE)('mentor real-DB integration (isolated local DB)', () => {
  it('serializes quota reservations and thread creation, refuses foreign users, and cleans up', async () => {
    assertLocalTestDatabase(URL_VALUE);
    const inherited = process.env.DATABASE_URL;
    if (inherited && inherited !== URL_VALUE) {
      throw new Error('DATABASE_URL must be unset or equal to MENTOR_DB_URL for this test.');
    }
    process.env.DATABASE_URL = URL_VALUE;

    const client = postgres(URL_VALUE, { prepare: false, max: 10 });
    const db = drizzle(client, { schema, casing: 'snake_case' });

    const userId = randomUUID();
    const unbookId = randomUUID();
    const sourceId = randomUUID();
    const interestId = randomUUID();
    const moduleId = randomUUID();

    try {
      await db.insert(schema.users).values({ id: userId, name: 'M7 Check' });
      await db.insert(schema.interests).values({
        id: interestId,
        slug: `m7-check-${randomUUID().slice(0, 8)}`,
        name: 'M7 Check',
        colorToken: 'primary',
      });
      await db.insert(schema.sources).values({
        id: sourceId,
        userId,
        type: 'text',
        title: 'Sumber M7',
        rightsConfirmedAt: new Date(),
        status: 'ready',
      });
      await db.insert(schema.unbooks).values({
        id: unbookId,
        userId,
        sourceId,
        title: 'Unbook M7',
        interestId,
        status: 'ready',
        moduleCount: 1,
        completedAt: new Date(),
      });
      await db.insert(schema.modules).values({
        id: moduleId,
        unbookId,
        sortOrder: 0,
        title: 'Modul M7',
        content: null,
      });

      // The real store and billing modules read DATABASE_URL lazily via @/db.
      const store = await import('@/lib/mentor/store');
      const quota = await import('@/lib/billing/mentor-quota');
      const suggestions = await import('@/lib/mentor/suggestions');
      const me = { userId };
      const now = new Date();

      const initial = await quota.getMentorAllowance(userId, now);
      expect(initial.limit).toBeGreaterThanOrEqual(3);
      const limit = initial.limit as number;
      expect(initial.used).toBe(0);

      // --- 10 concurrent reservations on 3 remaining: exactly 3 pass ---
      await db
        .insert(schema.usageCounters)
        .values({ userId, period: initial.period, mentorMessagesUsed: limit - 3 })
        .onConflictDoUpdate({
          target: [schema.usageCounters.userId, schema.usageCounters.period],
          set: { mentorMessagesUsed: limit - 3 },
        });

      const reservations = await Promise.allSettled(
        Array.from({ length: 10 }, () => quota.reserveMentorMessage(userId, now)),
      );
      const granted = reservations.filter((result) => result.status === 'fulfilled');
      const rejected = reservations.filter((result) => result.status === 'rejected');
      expect(granted).toHaveLength(3);
      expect(rejected).toHaveLength(7);
      for (const result of rejected) {
        expect((result as PromiseRejectedResult).reason).toMatchObject({ code: 'quotaExceeded' });
      }

      const [capped] = await db
        .select({ used: schema.usageCounters.mentorMessagesUsed })
        .from(schema.usageCounters)
        .where(
          and(
            eq(schema.usageCounters.userId, userId),
            eq(schema.usageCounters.period, initial.period),
          ),
        );
      expect(capped?.used).toBe(limit);

      // --- refund restores exactly one, and never below zero ---
      const first = granted[0] as PromiseFulfilledResult<{ reservation: { period: string } }>;
      await quota.refundMentorMessage(userId, first.value.reservation);
      const refunded = await quota.getMentorAllowance(userId, now);
      expect(refunded.used).toBe(limit - 1);

      // --- a rollover refund still debits the ORIGINAL period ---
      await db.insert(schema.usageCounters).values({
        userId,
        period: '2000-01',
        mentorMessagesUsed: 2,
      });
      await quota.refundMentorMessage(userId, { period: '2000-01' });
      const [oldPeriod] = await db
        .select({ used: schema.usageCounters.mentorMessagesUsed })
        .from(schema.usageCounters)
        .where(
          and(eq(schema.usageCounters.userId, userId), eq(schema.usageCounters.period, '2000-01')),
        );
      expect(oldPeriod?.used).toBe(1);

      // --- 5 concurrent thread creations produce exactly one row ---
      const threads = await Promise.all(
        Array.from({ length: 5 }, () => store.getOrCreateThread(me, unbookId)),
      );
      const threadIds = new Set(threads.map((thread) => thread.threadId));
      expect(threadIds.size).toBe(1);
      const [threadCount] = await db
        .select({ value: count() })
        .from(schema.mentorThreads)
        .where(eq(schema.mentorThreads.userId, userId));
      expect(Number(threadCount?.value)).toBe(1);

      const threadId = threads[0]!.threadId;
      await expect(store.getThreadContext(me, threadId)).resolves.toMatchObject({
        unbookId,
        sourceId,
        unbookTitle: 'Unbook M7',
      });
      await expect(suggestions.getSuggestedQuestions(me, unbookId)).resolves.toHaveLength(3);

      // --- another user never sees this thread or Unbook ---
      await expect(
        store.getThreadContext({ userId: OTHER_USER_ID }, threadId),
      ).rejects.toMatchObject({ code: 'notFound' });
      await expect(
        store.getOrCreateThread({ userId: OTHER_USER_ID }, unbookId),
      ).rejects.toMatchObject({ code: 'notFound' });
      await expect(
        suggestions.getSuggestedQuestions({ userId: OTHER_USER_ID }, unbookId),
      ).rejects.toMatchObject({ code: 'notFound' });
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
      await db.delete(schema.interests).where(eq(schema.interests.id, interestId));
      await client.end();
      const shared = (globalThis as { unbookinDb?: { $client: { end: () => Promise<void> } } })
        .unbookinDb;
      await shared?.$client.end();
    }
  });
});
