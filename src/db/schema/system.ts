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
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { identity } from './common';
import { byokConnection, byokProvider } from './enums';
import { interests } from './interests';

export const byokKeys = pgTable('byok_keys', {
  ...identity(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: byokProvider().notNull().default('openrouter'),
  encryptedKey: text().notNull(),
  iv: text().notNull(),
  authTag: text().notNull(),
  last4: text().notNull(),
  connectedVia: byokConnection().notNull(),
  verifiedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
});
export const aiTaskConfigs = pgTable('ai_task_configs', {
  ...identity(),
  task: text().notNull().unique(),
  model: text().notNull(),
  fallbackModel: text(),
  temperature: real().notNull().default(0.7),
  maxOutputTokens: integer().notNull(),
  isActive: boolean().notNull().default(true),
});
export const aiCalls = pgTable(
  'ai_calls',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    task: text().notNull(),
    model: text().notNull(),
    byok: boolean().notNull().default(false),
    inputTokens: integer(),
    outputTokens: integer(),
    costUsd: numeric({ precision: 12, scale: 6 }),
    latencyMs: integer(),
    status: text().notNull(),
    error: text(),
  },
  (t) => [
    index('ai_calls_user_id_idx').on(t.userId),
    index('ai_calls_task_idx').on(t.task),
    index('ai_calls_status_idx').on(t.status),
  ],
);
export const waitlist = pgTable(
  'waitlist',
  {
    ...identity(),
    email: text().notNull().unique(),
    interestSlug: text().references(() => interests.slug, { onDelete: 'set null' }),
    priceVariant: text(),
    referralCode: text().notNull().unique(),
    referredBy: uuid().references((): AnyPgColumn => waitlist.id, { onDelete: 'set null' }),
    sourceUtm: text(),
  },
  (t) => [
    index('waitlist_interest_slug_idx').on(t.interestSlug),
    index('waitlist_referred_by_idx').on(t.referredBy),
  ],
);
export const takedownRequests = pgTable(
  'takedown_requests',
  {
    ...identity(),
    reporterName: text().notNull(),
    reporterEmail: text().notNull(),
    workTitle: text().notNull(),
    description: text().notNull(),
    targetRef: text().notNull(),
    status: text().notNull().default('pending'),
  },
  (t) => [index('takedown_requests_status_idx').on(t.status)],
);
export const notificationPrefs = pgTable('notification_prefs', {
  ...identity(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailReviewDue: boolean().notNull().default(true),
  emailStreakRisk: boolean().notNull().default(true),
  emailWeeklySummary: boolean().notNull().default(true),
  pushEnabled: boolean().notNull().default(false),
});
export const auditLogs = pgTable(
  'audit_logs',
  {
    ...identity(),
    actorId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: uuid(),
    meta: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [
    index('audit_logs_actor_id_idx').on(t.actorId),
    index('audit_logs_target_idx').on(t.targetType, t.targetId),
    index('audit_logs_action_idx').on(t.action),
  ],
);
export type ByokKey = typeof byokKeys.$inferSelect;
export type NewByokKey = typeof byokKeys.$inferInsert;
export type AiTaskConfig = typeof aiTaskConfigs.$inferSelect;
export type NewAiTaskConfig = typeof aiTaskConfigs.$inferInsert;
export type AiCall = typeof aiCalls.$inferSelect;
export type NewAiCall = typeof aiCalls.$inferInsert;
export type Waitlist = typeof waitlist.$inferSelect;
export type NewWaitlist = typeof waitlist.$inferInsert;
export type TakedownRequest = typeof takedownRequests.$inferSelect;
export type NewTakedownRequest = typeof takedownRequests.$inferInsert;
export type NotificationPrefs = typeof notificationPrefs.$inferSelect;
export type NewNotificationPrefs = typeof notificationPrefs.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
