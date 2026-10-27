import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { count, eq } from 'drizzle-orm';
import * as schema from '@/db/schema';

/**
 * REAL-DB check on the isolated local database. SKIPPED unless
 * LEARNING_DB_URL is set; the runner exports:
 *   DATABASE_URL=postgres://unbookin:unbookin@127.0.0.1:5432/unbookin_m3_test_20261027
 *   LEARNING_DB_URL=same
 * Creates its own user + unbook + module + quiz + 5 cards, runs the real store
 * services twice each, asserts user_stats.total_xp = 70, then deletes everything.
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
      await db.insert(schema.quizQuestions).values({
        quizId: QUIZ_ID,
        sortOrder: 6,
        bloomLevel: 'evaluate',
        type: 'short_answer',
        prompt: 'Jelaskan dengan kata-katamu.',
        correct: 'Jawaban model.',
        rubric: ['1', '2', '3', '4'],
        explanation: 'karena',
        chunkRefs: [CHUNK_ID],
      });
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

      // Exercise the REAL store services against this database (lazy `@/db` reads DATABASE_URL).
      process.env.DATABASE_URL = URL;
      const store = await import('@/lib/learning/store');
      const me = { userId: USER_ID };

      // --- foreign users cannot touch this module ---
      await expect(
        store.markModuleRead({ userId: 'a1b2c3d4-0000-4000-8000-0000000000ff' }, { moduleId: MODULE_ID }),
      ).rejects.toMatchObject({ code: 'notFound' });

      // --- markModuleRead twice: XP 20 once, 5 card_states ---
      for (const run of [1, 2]) {
        const read = await store.markModuleRead(me, { moduleId: MODULE_ID });
        expect(read.xpAwarded).toBe(run === 1);
        expect(read.cardsQueued).toBe(5);
      }
      const [queued] = await db
        .select({ value: count() })
        .from(schema.cardStates)
        .where(eq(schema.cardStates.userId, USER_ID));
      expect(Number(queued?.value)).toBe(5);

      // --- queued-but-unrated cards never earn review XP ---
      expect((await store.completeReviewSession(me)).xpAwarded).toBe(false);

      // --- quiz at 100% twice: 30 + 10 XP once per module ---
      const questions = await db
        .select({ id: schema.quizQuestions.id, type: schema.quizQuestions.type })
        .from(schema.quizQuestions)
        .where(eq(schema.quizQuestions.quizId, QUIZ_ID));
      for (const run of [1, 2]) {
        const { attemptId } = await store.startQuizAttempt(me, { quizId: QUIZ_ID });
        for (const question of questions) {
          if (question.type === 'short_answer') {
            const feedback = await store.recordQuizAnswer(me, {
              attemptId,
              questionId: question.id,
              answer: 'Jawaban saya.',
            });
            expect(feedback).toMatchObject({ needsGrading: true, modelAnswer: 'Jawaban model.' });
            await store.recordShortAnswerGrade(me, {
              attemptId,
              questionId: question.id,
              grade: run === 1 ? { grade: 4 } : { selfGraded: true, correct: true },
            });
            continue;
          }
          const feedback = await store.recordQuizAnswer(me, {
            attemptId,
            questionId: question.id,
            answer: 0,
          });
          expect(feedback.correct).toBe(true);
        }
        const finished = await store.finishQuizAttempt(me, { attemptId });
        expect(finished).toMatchObject({ scorePct: 100, passed: true, xpAwarded: run === 1 });
      }

      // --- rate one card, then complete the session twice: 10 XP once ---
      const rated = await store.rateReviewCard(me, { cardId: cardIds[0]!, result: 'good' });
      expect(rated.box).toBe(1);
      expect((await store.completeReviewSession(me)).xpAwarded).toBe(true);
      expect((await store.completeReviewSession(me)).xpAwarded).toBe(false);

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
      const shared = (globalThis as { unbookinDb?: { $client: { end: () => Promise<void> } } }).unbookinDb;
      await shared?.$client.end();
    }
  });
});
