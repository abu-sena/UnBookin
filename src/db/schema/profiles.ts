import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { identity } from './common';
import { experienceLevel } from './enums';

export const profiles = pgTable(
  'profiles',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text(),
    jobRole: text(),
    goal: text(),
    experienceLevel: experienceLevel().notNull().default('novice'),
    dailyGoalMinutes: integer().notNull().default(10),
    timezone: text().notNull().default('Asia/Jakarta'),
    locale: text().notNull().default('id'),
    onboardedAt: timestamp({ withTimezone: true }),
  },
  (t) => [check('profiles_daily_goal_check', sql`${t.dailyGoalMinutes} in (5, 10, 20)`)],
);
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
