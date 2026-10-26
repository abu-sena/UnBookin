import { PgDatabase, PgDialect } from 'drizzle-orm/pg-core';
import type { LibraryDatabase } from '@/lib/library/query';

export type RecordedQuery = {
  sql: string;
  params: unknown[];
};

/**
 * A real Drizzle query builder backed by a fake session. It records the SQL
 * each call would send (so tenancy predicates can be asserted) and returns the
 * queued fixture rows.
 */
export function createRecordingDatabase(results: unknown[][]) {
  // Match the production `drizzle(client, { casing: 'snake_case' })` config.
  const dialect = new PgDialect({ casing: 'snake_case' });
  const queries: RecordedQuery[] = [];
  let resultIndex = 0;

  const session = {
    prepareQuery(query: { sql: string; params: unknown[] }) {
      queries.push({ sql: query.sql, params: [...query.params] });
      const rows = results[resultIndex] ?? [];
      resultIndex += 1;

      const prepared = {
        setToken() {
          return prepared;
        },
        async execute() {
          return rows;
        },
      };
      return prepared;
    },
  };

  const database = new PgDatabase(dialect, session as never, undefined);

  return {
    database: database as unknown as LibraryDatabase,
    queries,
  };
}
