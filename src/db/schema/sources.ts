import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { identity } from './common';
import { sourceStatus, sourceType } from './enums';

export const sources = pgTable(
  'sources',
  {
    ...identity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: sourceType().notNull(),
    title: text().notNull(),
    author: text(),
    year: integer(),
    fileKey: text(),
    url: text(),
    mimeType: text(),
    sizeBytes: bigint({ mode: 'number' }),
    pageCount: integer(),
    wordCount: integer(),
    language: text(),
    status: sourceStatus().notNull().default('uploaded'),
    errorCode: text(),
    rightsConfirmedAt: timestamp({ withTimezone: true }).notNull(),
    fileDeletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('sources_user_id_idx').on(t.userId), index('sources_status_idx').on(t.status)],
);
export const sourceChunks = pgTable(
  'source_chunks',
  {
    ...identity(),
    sourceId: uuid()
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    idx: integer().notNull(),
    chapterTitle: text(),
    pageFrom: integer(),
    pageTo: integer(),
    text: text().notNull(),
    tokenCount: integer().notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  (t) => [
    index('source_chunks_source_id_idx').on(t.sourceId),
    index('source_chunks_embedding_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('source_chunks_text_gin_idx').using('gin', sql`to_tsvector('simple', ${t.text})`),
  ],
);
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type SourceChunk = typeof sourceChunks.$inferSelect;
export type NewSourceChunk = typeof sourceChunks.$inferInsert;
