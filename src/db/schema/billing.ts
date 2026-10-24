import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { PlanLimits } from '../../lib/billing/plan-limits';
import { users } from './auth';
import { identity } from './common';
import { paymentKind, planCode, subscriptionStatus } from './enums';

export const plans = pgTable(
  'plans',
  {
    ...identity(),
    code: planCode().notNull().unique(),
    name: text().notNull(),
    priceIdr: integer().notNull(),
    interval: text().notNull(),
    limits: jsonb().$type<PlanLimits>().notNull(),
    isActive: boolean().notNull().default(true),
  },
  (t) => [index('plans_is_active_idx').on(t.isActive)],
);
export const subscriptions = pgTable(
  'subscriptions',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planCode: planCode()
      .notNull()
      .references(() => plans.code),
    status: subscriptionStatus().notNull().default('active'),
    currentPeriodStart: timestamp({ withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp({ withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean().notNull().default(false),
  },
  (t) => [
    index('subscriptions_user_id_idx').on(t.userId),
    index('subscriptions_plan_code_idx').on(t.planCode),
    index('subscriptions_status_idx').on(t.status),
    index('subscriptions_period_end_idx').on(t.currentPeriodEnd),
  ],
);
export const payments = pgTable(
  'payments',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: paymentKind().notNull(),
    refId: uuid(),
    amountIdr: integer().notNull(),
    midtransOrderId: text().notNull().unique(),
    midtransStatus: text().notNull().default('pending'),
    paymentType: text(),
    paidAt: timestamp({ withTimezone: true }),
    raw: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [
    index('payments_user_id_idx').on(t.userId),
    index('payments_ref_id_idx').on(t.refId),
    index('payments_status_idx').on(t.midtransStatus),
  ],
);
export const usageCounters = pgTable(
  'usage_counters',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    period: text().notNull(),
    unbooksUsed: integer().notNull().default(0),
    mentorMessagesUsed: integer().notNull().default(0),
    pagesProcessed: integer().notNull().default(0),
  },
  (t) => [unique().on(t.userId, t.period)],
);
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type UsageCounter = typeof usageCounters.$inferSelect;
export type NewUsageCounter = typeof usageCounters.$inferInsert;
