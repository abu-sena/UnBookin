import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { identity } from './common';
import { userRole } from './enums';

export const users = pgTable(
  'users',
  {
    ...identity(),
    name: text(),
    email: text().unique(),
    emailVerified: timestamp({ withTimezone: true }),
    image: text(),
    role: userRole().notNull().default('user'),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('users_role_idx').on(t.role), index('users_deleted_at_idx').on(t.deletedAt)],
);
export const accounts = pgTable(
  'accounts',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text().$type<'oauth' | 'oidc' | 'email' | 'webauthn'>().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    refresh_token: text(),
    access_token: text(),
    expires_at: integer(),
    token_type: text(),
    scope: text(),
    id_token: text(),
    session_state: text(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index('accounts_user_id_idx').on(t.userId),
  ],
);
export const sessions = pgTable(
  'sessions',
  {
    sessionToken: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId), index('sessions_expires_idx').on(t.expires)],
);
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;
