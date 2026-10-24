import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { identity } from './common';
import { actionStatus } from './enums';
import { modules } from './unbooks';

export const actions = pgTable(
  'actions',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    description: text(),
    dueAt: timestamp({ withTimezone: true }),
    status: actionStatus().notNull().default('planned'),
  },
  (t) => [
    index('actions_user_id_idx').on(t.userId),
    index('actions_module_id_idx').on(t.moduleId),
    index('actions_status_idx').on(t.status),
    index('actions_due_at_idx').on(t.dueAt),
  ],
);
export const actionReports = pgTable(
  'action_reports',
  {
    ...identity(),
    actionId: uuid()
      .notNull()
      .references(() => actions.id, { onDelete: 'cascade' }),
    whatIDid: text().notNull(),
    result: text().notNull(),
    reflection: text().notNull(),
    evidenceUrl: text(),
    aiFeedback: text(),
    qualityScore: integer(),
    verified: boolean().notNull().default(false),
  },
  (t) => [
    index('action_reports_action_id_idx').on(t.actionId),
    check('action_reports_quality_check', sql`${t.qualityScore} between 1 and 4`),
    check(
      'action_reports_verified_check',
      sql`${t.verified} = coalesce(${t.qualityScore} >= 3, false)`,
    ),
  ],
);
export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;
export type ActionReport = typeof actionReports.$inferSelect;
export type NewActionReport = typeof actionReports.$inferInsert;
