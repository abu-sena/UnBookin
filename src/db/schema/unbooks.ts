import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type { ModuleContent } from '../../lib/engine/module-content';
import { users } from './auth';
import { identity } from './common';
import { contentLayer, moduleStatus, unbookStatus } from './enums';
import { domains, interests } from './interests';
import { originals } from './originals';
import { sources } from './sources';

export const unbooks = pgTable(
  'unbooks',
  {
    ...identity(),
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    sourceId: uuid().references(() => sources.id, { onDelete: 'set null' }),
    originalId: uuid().references((): AnyPgColumn => originals.id, { onDelete: 'set null' }),
    title: text().notNull(),
    bigIdea: text(),
    interestId: uuid()
      .notNull()
      .references(() => interests.id),
    status: unbookStatus().notNull().default('queued'),
    progressPct: integer().notNull().default(0),
    currentStage: text(),
    moduleCount: integer().notNull().default(0),
    usedByok: boolean().notNull().default(false),
    costUsd: numeric({ precision: 12, scale: 6 }).notNull().default('0'),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('unbooks_user_id_idx').on(t.userId),
    index('unbooks_source_id_idx').on(t.sourceId),
    index('unbooks_original_id_idx').on(t.originalId),
    index('unbooks_interest_id_idx').on(t.interestId),
    index('unbooks_status_idx').on(t.status),
  ],
);
export const modules = pgTable(
  'modules',
  {
    ...identity(),
    unbookId: uuid()
      .notNull()
      .references(() => unbooks.id, { onDelete: 'cascade' }),
    sortOrder: integer().notNull(),
    title: text().notNull(),
    summary: text(),
    content: jsonb().$type<ModuleContent>(),
    estimatedMinutes: integer(),
    sourcePageFrom: integer(),
    sourcePageTo: integer(),
  },
  (t) => [index('modules_unbook_sort_idx').on(t.unbookId, t.sortOrder)],
);
export const moduleDomains = pgTable(
  'module_domains',
  {
    ...identity(),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    domainId: uuid()
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    confidence: real().notNull(),
  },
  (t) => [
    unique().on(t.moduleId, t.domainId),
    index('module_domains_domain_id_idx').on(t.domainId),
  ],
);
export const moduleProgress = pgTable(
  'module_progress',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    moduleId: uuid()
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    status: moduleStatus().notNull().default('not_started'),
    deepestLayer: contentLayer().notNull().default('eli5'),
    readAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique().on(t.userId, t.moduleId),
    index('module_progress_module_id_idx').on(t.moduleId),
    index('module_progress_status_idx').on(t.status),
  ],
);
export type Unbook = typeof unbooks.$inferSelect;
export type NewUnbook = typeof unbooks.$inferInsert;
export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;
export type ModuleDomain = typeof moduleDomains.$inferSelect;
export type NewModuleDomain = typeof moduleDomains.$inferInsert;
export type ModuleProgress = typeof moduleProgress.$inferSelect;
export type NewModuleProgress = typeof moduleProgress.$inferInsert;
