import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { BadgeRule } from '../../lib/game/badge-rules';
import { users } from './auth';
import { identity } from './common';
import { badgeTier, domainLevel, missionType } from './enums';
import { domains } from './interests';

export const xpEvents = pgTable(
  'xp_events',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    amount: integer().notNull(),
    domainId: uuid().references(() => domains.id, { onDelete: 'set null' }),
    refType: text().notNull(),
    refId: uuid().notNull(),
  },
  (t) => [
    unique().on(t.userId, t.type, t.refType, t.refId),
    index('xp_events_domain_id_idx').on(t.domainId),
  ],
);
export const userStats = pgTable('user_stats', {
  ...identity(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  totalXp: integer().notNull().default(0),
  level: integer().notNull().default(1),
  currentStreak: integer().notNull().default(0),
  longestStreak: integer().notNull().default(0),
  streakFreezes: integer().notNull().default(0),
  lastActiveDate: date(),
});
export const domainProgress = pgTable(
  'domain_progress',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    domainId: uuid()
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    xp: integer().notNull().default(0),
    level: domainLevel().notNull().default('novice'),
    verifiedActions: integer().notNull().default(0),
  },
  (t) => [unique().on(t.userId, t.domainId), index('domain_progress_domain_id_idx').on(t.domainId)],
);
export const badges = pgTable('badges', {
  ...identity(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text().notNull(),
  icon: text().notNull(),
  rule: jsonb().$type<BadgeRule>().notNull(),
  tier: badgeTier().notNull(),
});
export const userBadges = pgTable(
  'user_badges',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeId: uuid()
      .notNull()
      .references(() => badges.id, { onDelete: 'cascade' }),
    earnedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.badgeId), index('user_badges_badge_id_idx').on(t.badgeId)],
);
export const missionTemplates = pgTable(
  'mission_templates',
  {
    ...identity(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    type: missionType().notNull(),
    target: integer().notNull(),
    xpReward: integer().notNull(),
  },
  (t) => [index('mission_templates_type_idx').on(t.type)],
);
export const userMissions = pgTable(
  'user_missions',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    templateId: uuid()
      .notNull()
      .references(() => missionTemplates.id, { onDelete: 'cascade' }),
    weekStart: date().notNull(),
    progress: integer().notNull().default(0),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique().on(t.userId, t.templateId, t.weekStart),
    index('user_missions_template_id_idx').on(t.templateId),
    index('user_missions_user_week_idx').on(t.userId, t.weekStart),
  ],
);
export type XpEvent = typeof xpEvents.$inferSelect;
export type NewXpEvent = typeof xpEvents.$inferInsert;
export type UserStats = typeof userStats.$inferSelect;
export type NewUserStats = typeof userStats.$inferInsert;
export type DomainProgress = typeof domainProgress.$inferSelect;
export type NewDomainProgress = typeof domainProgress.$inferInsert;
export type Badge = typeof badges.$inferSelect;
export type NewBadge = typeof badges.$inferInsert;
export type UserBadge = typeof userBadges.$inferSelect;
export type NewUserBadge = typeof userBadges.$inferInsert;
export type MissionTemplate = typeof missionTemplates.$inferSelect;
export type NewMissionTemplate = typeof missionTemplates.$inferInsert;
export type UserMission = typeof userMissions.$inferSelect;
export type NewUserMission = typeof userMissions.$inferInsert;
