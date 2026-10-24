import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { identity } from './common';
import { mentorRole } from './enums';
import { unbooks } from './unbooks';

export const mentorThreads = pgTable(
  'mentor_threads',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    unbookId: uuid()
      .notNull()
      .references(() => unbooks.id, { onDelete: 'cascade' }),
    title: text().notNull(),
  },
  (t) => [
    index('mentor_threads_user_id_idx').on(t.userId),
    index('mentor_threads_unbook_id_idx').on(t.unbookId),
  ],
);
export const mentorMessages = pgTable(
  'mentor_messages',
  {
    ...identity(),
    threadId: uuid()
      .notNull()
      .references(() => mentorThreads.id, { onDelete: 'cascade' }),
    role: mentorRole().notNull(),
    content: text().notNull(),
    citations: jsonb().$type<{ chunkId: string; page: number | null }[]>(),
    inputTokens: integer(),
    outputTokens: integer(),
  },
  (t) => [index('mentor_messages_thread_id_idx').on(t.threadId)],
);
export type MentorThread = typeof mentorThreads.$inferSelect;
export type NewMentorThread = typeof mentorThreads.$inferInsert;
export type MentorMessage = typeof mentorMessages.$inferSelect;
export type NewMentorMessage = typeof mentorMessages.$inferInsert;
