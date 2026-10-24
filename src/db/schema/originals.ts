import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { payments } from './billing';
import { identity } from './common';
import { interests } from './interests';
import { unbooks } from './unbooks';

export const originals = pgTable(
  'originals',
  {
    ...identity(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    authorName: text().notNull(),
    coverKey: text(),
    description: text(),
    interestId: uuid()
      .notNull()
      .references(() => interests.id),
    priceIdr: integer().notNull(),
    isPublished: boolean().notNull().default(false),
    unbookId: uuid().references((): AnyPgColumn => unbooks.id, { onDelete: 'set null' }),
    sampleModuleCount: integer().notNull().default(1),
  },
  (t) => [
    index('originals_interest_id_idx').on(t.interestId),
    index('originals_unbook_id_idx').on(t.unbookId),
    index('originals_published_idx').on(t.isPublished),
  ],
);
export const originalPurchases = pgTable(
  'original_purchases',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originalId: uuid()
      .notNull()
      .references(() => originals.id, { onDelete: 'cascade' }),
    paymentId: uuid().references(() => payments.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('original_purchases_user_id_idx').on(t.userId),
    index('original_purchases_original_id_idx').on(t.originalId),
    index('original_purchases_payment_id_idx').on(t.paymentId),
  ],
);
export type Original = typeof originals.$inferSelect;
export type NewOriginal = typeof originals.$inferInsert;
export type OriginalPurchase = typeof originalPurchases.$inferSelect;
export type NewOriginalPurchase = typeof originalPurchases.$inferInsert;
