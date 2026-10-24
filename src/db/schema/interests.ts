import { boolean, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { identity } from './common';
import { users } from './auth';

export const interests = pgTable(
  'interests',
  {
    ...identity(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    icon: text(),
    colorToken: text().notNull(),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index('interests_active_sort_idx').on(t.isActive, t.sortOrder)],
);
export const domains = pgTable(
  'domains',
  {
    ...identity(),
    interestId: uuid()
      .notNull()
      .references(() => interests.id, { onDelete: 'cascade' }),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [unique().on(t.interestId, t.slug)],
);
export const userInterests = pgTable(
  'user_interests',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    interestId: uuid()
      .notNull()
      .references(() => interests.id, { onDelete: 'cascade' }),
    isPrimary: boolean().notNull().default(false),
  },
  (t) => [
    unique().on(t.userId, t.interestId),
    index('user_interests_interest_id_idx').on(t.interestId),
  ],
);
export type Interest = typeof interests.$inferSelect;
export type NewInterest = typeof interests.$inferInsert;
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type UserInterest = typeof userInterests.$inferSelect;
export type NewUserInterest = typeof userInterests.$inferInsert;
