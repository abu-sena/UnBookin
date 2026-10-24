import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { identity } from './common';
import { bloomLevel, questionType, reviewResult } from './enums';
import { sourceChunks } from './sources';
import { modules } from './unbooks';

export const quizzes = pgTable(
  'quizzes',
  {
    ...identity(),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    version: integer().notNull().default(1),
    isActive: boolean().notNull().default(true),
  },
  (t) => [
    index('quizzes_module_id_idx').on(t.moduleId),
    index('quizzes_active_idx').on(t.isActive),
  ],
);
export const quizQuestions = pgTable(
  'quiz_questions',
  {
    ...identity(),
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    sortOrder: integer().notNull(),
    bloomLevel: bloomLevel().notNull(),
    type: questionType().notNull(),
    prompt: text().notNull(),
    options: jsonb().$type<unknown>(),
    correct: jsonb().$type<unknown>().notNull(),
    explanation: text().notNull(),
    rubric: jsonb().$type<unknown>(),
    chunkRefs: uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
  },
  (t) => [index('quiz_questions_quiz_sort_idx').on(t.quizId, t.sortOrder)],
);
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: uuid()
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    answers: jsonb().$type<Record<string, unknown>>().notNull(),
    scorePct: real(),
    passed: boolean(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('quiz_attempts_user_id_idx').on(t.userId),
    index('quiz_attempts_quiz_id_idx').on(t.quizId),
  ],
);
export const reviewCards = pgTable(
  'review_cards',
  {
    ...identity(),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    front: text().notNull(),
    back: text().notNull(),
    chunkRef: uuid().references(() => sourceChunks.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('review_cards_module_id_idx').on(t.moduleId),
    index('review_cards_chunk_ref_idx').on(t.chunkRef),
  ],
);
export const cardStates = pgTable(
  'card_states',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: uuid()
      .notNull()
      .references(() => reviewCards.id, { onDelete: 'cascade' }),
    box: integer().notNull().default(0),
    dueAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastResult: reviewResult(),
    reviewedCount: integer().notNull().default(0),
  },
  (t) => [
    unique().on(t.userId, t.cardId),
    index('card_states_card_id_idx').on(t.cardId),
    index('card_states_user_due_idx').on(t.userId, t.dueAt),
    index('card_states_due_at_idx').on(t.dueAt),
    check('card_states_box_check', sql`${t.box} between 0 and 5`),
  ],
);
export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type NewQuizQuestion = typeof quizQuestions.$inferInsert;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type NewQuizAttempt = typeof quizAttempts.$inferInsert;
export type ReviewCard = typeof reviewCards.$inferSelect;
export type NewReviewCard = typeof reviewCards.$inferInsert;
export type CardState = typeof cardStates.$inferSelect;
export type NewCardState = typeof cardStates.$inferInsert;
