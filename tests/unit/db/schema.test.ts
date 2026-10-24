import { getTableName, is, Table } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../../../src/db/schema';

const expectedTables = [
  'users',
  'accounts',
  'sessions',
  'verification_tokens',
  'profiles',
  'interests',
  'domains',
  'user_interests',
  'sources',
  'source_chunks',
  'unbooks',
  'modules',
  'module_domains',
  'module_progress',
  'quizzes',
  'quiz_questions',
  'quiz_attempts',
  'review_cards',
  'card_states',
  'actions',
  'action_reports',
  'xp_events',
  'user_stats',
  'domain_progress',
  'badges',
  'user_badges',
  'mission_templates',
  'user_missions',
  'mentor_threads',
  'mentor_messages',
  'originals',
  'original_purchases',
  'plans',
  'subscriptions',
  'payments',
  'usage_counters',
  'byok_keys',
  'ai_task_configs',
  'ai_calls',
  'waitlist',
  'takedown_requests',
  'notification_prefs',
  'audit_logs',
];

describe('PRD database schema', () => {
  it('exports every section 6 table exactly once', () => {
    const names = Object.values(schema)
      .filter((value) => is(value, Table))
      .map((table) => getTableName(table));
    expect(names.sort()).toEqual([...expectedTables].sort());
  });

  it('indexes embeddings with HNSW cosine and text with GIN', () => {
    const indexes = getTableConfig(schema.sourceChunks).indexes;
    expect(
      indexes.find((idx) => idx.config.name === 'source_chunks_embedding_hnsw_idx')?.config.method,
    ).toBe('hnsw');
    expect(
      indexes.find((idx) => idx.config.name === 'source_chunks_text_gin_idx')?.config.method,
    ).toBe('gin');
    const embeddingIndex = indexes.find((idx) => idx.config.method === 'hnsw');
    expect(embeddingIndex?.config.columns[0]).toMatchObject({
      indexConfig: { opClass: 'vector_cosine_ops' },
    });
  });

  it('requires rights confirmation and stores 1536-dimensional embeddings', () => {
    expect(schema.sources.rightsConfirmedAt.notNull).toBe(true);
    expect(schema.sourceChunks.embedding.getSQLType()).toBe('vector(1536)');
    expect(schema.quizQuestions.chunkRefs.getSQLType()).toBe('uuid[]');
  });

  it('indexes every foreign key and cascades user deletion except retained logs', () => {
    for (const table of Object.values(schema).filter((value) => is(value, Table))) {
      const config = getTableConfig(table);
      for (const fk of config.foreignKeys) {
        const reference = fk.reference();
        for (const column of reference.columns) {
          const indexed =
            column.isUnique ||
            config.indexes.some(
              (idx) =>
                'name' in idx.config.columns[0]! && idx.config.columns[0].name === column.name,
            ) ||
            config.uniqueConstraints.some(
              (constraint) => constraint.columns[0]?.name === column.name,
            );
          expect(indexed, `${config.name}.${column.name} lacks an index`).toBe(true);
        }
        if (getTableName(reference.foreignTable) === 'users') {
          // AI cost logs and the audit trail outlive a deleted account (no user content in them).
          const expected = ['ai_calls', 'audit_logs'].includes(config.name)
            ? 'set null'
            : 'cascade';
          expect(fk.onDelete, `${config.name} user FK`).toBe(expected);
        }
      }
    }
  });
});
