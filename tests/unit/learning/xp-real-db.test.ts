import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { count, eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { isAnswerCorrect, scoreAttempt, weakConcepts } from '@/lib/learning/quiz-scoring';
import { firstDueAt } from '@/lib/learning/leitner';
import { awardXp } from '@/lib/game/xp';
import {
  MODULE_READ,
  QUIZ_PASS,
  QUIZ_PERFECT_BONUS,
  REVIEW_DAILY,
  XP_EVENT_TYPES,
  XP_REF_TYPES,
} from '@/lib/game/xp-rules';
import { localDate } from '@/lib/learning/leitner';

/**
 * REAL-DB check on the isolated local database. SKIPPED unless
 * LEARNING_DB_URL is set; the runner exports:
 *   DATABASE_URL=postgres://unbookin:unbookin@127.0.0.1:5432/unbookin_m3_test_20261027
 *   LEARNING_DB_URL=same
 * Creates its own user + unbook + module + quiz + 5 cards, runs the XP flows
 * twice each, asserts user_stats.total_xp = 70, then deletes everything.
 */
const URL = process.env.LEARNING_DB_URL ?? '';

const USER_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const UNBOOK_ID = 'b2c3d4e5-0000-4000-8000-000000000002';
const MODULE_ID = 'c3d4e5f6-0000-4000-8000-000000000003';
const QUIZ_ID = 'd4e5f6a7-0000-4000-8000-000000000004';
const INTEREST_ID = 'e5f6a7b8-0000-4000-8000-000000000005';
const SOURCE_ID = 'f6a7b8c9-0000-4000-8000-000000000006';
const CHUNK_ID = 'a7b8c9d0-0000-4000-8000-000000000007';

describe.skipIf(!URL)('learning real-DB check (isolated local DB)', () => {
  it('awards 20+40+10 = 70 XP exactly once across repeated calls', async () => {
    const client = postgres(URL, { prepare: false, max: 1 });
    const db = drizzle(client, { schema, casing: 'snake_case' });
    const created: string[] = [];

    try {
      await db.execute(`delete from users where id = '${USER_ID}'`);

      await db.insert(schema.users).values({ id: USER_ID, name: 'M5 Check' });
      created.push('users');
      await db.insert(schema.interests).values({
        id: INTEREST_ID,
        slug: `m5-check-${Date.now()}`,
        name: 'M5 Check',
        colorToken: 'primary',
      });
      await db.insert(schema.sources).values({
        id: SOURCE_ID,
        userId: USER_ID,
        type: 'text',
        title: 'Sumber M5',
        rightsConfirmedAt: new Date(),
        status: 'ready',
      });
      await db.insert(schema.sourceChunks).values({
        id: CHUNK_ID,
        sourceId: SOURCE_ID,
        idx: 0,
        text: 'Teks sumber untuk pemeriksaan M5.',
        tokenCount: 8,
      });
      await db.insert(schema.unbooks).values({
        id: UNBOOK_ID,
        userId: USER_ID,
        sourceId: SOURCE_ID,
        title: 'Unbook M5',
        interestId: INTEREST_ID,
        status: 'ready',
        moduleCount: 1,
        completedAt: new Date(),
      });
      await db.insert(schema.modules).values({
        id: MODULE_ID,
        unbookId: UNBOOK_ID,
        sortOrder: 0,
        title: 'Modul M5',
        content: null,
      });
      await db.insert(schema.quizzes).values({ id: QUIZ_ID, moduleId: MODULE_ID, isActive: true });
      await db.insert(schema.quizQuestions).values(
        Array.from({ length: 6 }, (_, index) => ({
          quizId: QUIZ_ID,
          sortOrder: index,
          bloomLevel: 'remember' as const,
          type: 'mcq' as const,
          prompt: `Soal ${index}?`,
          options: ['a', 'b', 'c'],
          correct: 0,
          explanation: 'karena',
          chunkRefs: [CHUNK_ID],
        })),
      );
      const cardIds = Array.from({ length: 5 }, (_, index) => index).map(
        (index) => `b8c9d0e1-0000-4000-8000-00000000001${index}`,
      );
      await db.insert(schema.reviewCards).values(
        cardIds.map((cardId, index) => ({
          id: cardId,
          moduleId: MODULE_ID,
          front: `depan ${index}`,
          back: `belakang ${index}`,
          chunkRef: CHUNK_ID,
        })),
      );

      // --- markModuleRead twice: XP 20 once, 5 card_states ---
      const timeZone = 'Asia/Jakarta';
      const now = new Date();

      for (const run of [1, 2]) {
        await db.transaction(async (tx) => {
          const readAt = run === 1 ? now : undefined;
          await tx
            .insert(schema.moduleProgress)
            .values({ userId: USER_ID, moduleId: MODULE_ID, status: 'read', ...(readAt ? { readAt } : {}) })
            .onConflictDoUpdate({
              target: [schema.moduleProgress.userId, schema.moduleProgress.moduleId],
              set: { status: 'read' },
            });
          await awardXp(tx, {
            userId: USER_ID,
            type: XP_EVENT_TYPES.MODULE_READ,
            amount: MODULE_READ,
            refType: XP_REF_TYPES.MODULE,
            refId: MODULE_ID,
          });
          const dueAt = firstDueAt(new Date(), timeZone);
          await tx
            .insert(schema.cardStates)
            .values(
              cardIds.map((cardId) => ({ userId: USER_ID, cardId, box: 0, dueAt })),
            )
            .onConflictDoNothing({ target: [schema.cardStates.userId, schema.cardStates.cardId] });
        });
      }

      const [readCount] = await db
        .select({ value: count() })
        .from(schema.xpEvents)
        .where(eq(schema.xpEvents.type, XP_EVENT_TYPES.MODULE_READ));
      expect(Number(readCount?.value)).toBe(1);

      const cardStateRows = await db
        .select()
        .from(schema.cardStates)
        .where(eq(schema.cardStates.userId, USER_ID));
      expect(cardStateRows).toHaveLength(5);
      expect(cardStateRows.every((row) => row.box === 0)).toBe(true);

      // --- finishQuizAttempt at 100% twice: XP 40 once (30 + 10 perfect) ---
      const answers = Object.fromEntries(
        (await db.select().from(schema.quizQuestions).where(eq(schema.quizQuestions.quizId, QUIZ_ID))).map(
          (question) => [question.id, { type: 'mcq', index: 0 }],
        ),
      );
      const questions = await db
        .select()
        .from(schema.quizQuestions)
        .where(eq(schema.quizQuestions.quizId, QUIZ_ID));
      const score = scoreAttempt(
        questions.map((question) => ({
          id: question.id,
          type: question.type,
          correct: question.correct,
          bloomLevel: question.bloomLevel,
          chunkRefs: [...question.chunkRefs],
        })),
        answers as Record<string, unknown>,
      );
      expect(score.scorePct).toBe(100);
      expect(score.passed).toBe(true);
      expect(weakConcepts([], {}).chunkIds).toEqual([]);

      for (const run of [1, 2]) {
        await db.transaction(async (tx) => {
          await tx.insert(schema.quizAttempts).values({
            userId: USER_ID,
            quizId: QUIZ_ID,
            answers,
            scorePct: 100,
            passed: true,
            finishedAt: now,
          });
          void run;
          if (score.passed) {
            await awardXp(tx, {
              userId: USER_ID,
              type: XP_EVENT_TYPES.QUIZ_PASS,
              amount: QUIZ_PASS,
              refType: XP_REF_TYPES.MODULE_QUIZ,
              refId: MODULE_ID,
            });
            if (score.scorePct === 100) {
              await awardXp(tx, {
                userId: USER_ID,
                type: XP_EVENT_TYPES.QUIZ_PERFECT_BONUS,
                amount: QUIZ_PERFECT_BONUS,
                refType: XP_REF_TYPES.MODULE_QUIZ,
                refId: MODULE_ID,
              });
            }
          }
        });
      }

      // --- rateReviewCard + completeReviewSession twice: XP 10 once ---
      const day = localDate(now, timeZone);
      const goodAnswer = { type: 'mcq', index: 0 };
      expect(isAnswerCorrect({ id: 'x', type: 'mcq', correct: 0 }, goodAnswer)).toBe(true);

      for (const run of [1, 2]) {
        await db.transaction(async (tx) => {
          const box = run === 1 ? 0 : 1;
          await tx
            .update(schema.cardStates)
            .set({ box, lastResult: 'good', reviewedCount: run })
            .where(eq(schema.cardStates.cardId, cardIds[0]!));
          await awardXp(tx, {
            userId: USER_ID,
            type: XP_EVENT_TYPES.REVIEW_DAILY,
            amount: REVIEW_DAILY,
            refType: XP_REF_TYPES.REVIEW,
            refId: (await import('@/lib/game/xp')).dailyRefId(USER_ID, day),
          });
        });
      }

      const [reviewCount] = await db
        .select({ value: count() })
        .from(schema.xpEvents)
        .where(eq(schema.xpEvents.type, XP_EVENT_TYPES.REVIEW_DAILY));
      expect(Number(reviewCount?.value)).toBe(1);

      // --- total ---
      const [stats] = await db
        .select()
        .from(schema.userStats)
        .where(eq(schema.userStats.userId, USER_ID));
      expect(stats?.totalXp).toBe(70);
    } finally {
      // Delete everything this check created (cascades from users/unbooks).
      await db.delete(schema.users).where(eq(schema.users.id, USER_ID));
      await db.delete(schema.unbooks).where(eq(schema.unbooks.id, UNBOOK_ID));
      await db.delete(schema.reviewCards).where(eq(schema.reviewCards.moduleId, MODULE_ID));
      await db.delete(schema.quizzes).where(eq(schema.quizzes.moduleId, MODULE_ID));
      await db.delete(schema.modules).where(eq(schema.modules.id, MODULE_ID));
      await db.delete(schema.sourceChunks).where(eq(schema.sourceChunks.sourceId, SOURCE_ID));
      await db.delete(schema.sources).where(eq(schema.sources.id, SOURCE_ID));
      await db.delete(schema.interests).where(eq(schema.interests.id, INTEREST_ID));
      await client.end();
    }
  });
});
