import { PgDatabase, PgDialect } from 'drizzle-orm/pg-core';
import type { SourceQueryDatabase } from '@/lib/sources/queries';

export type RecordedQuery = { sql: string; params: unknown[] };

/**
 * A real Drizzle query builder backed by a fake session. Records the SQL each
 * call would send (tenancy predicates are asserted against it) and returns the
 * queued fixture rows. Same approach as `tests/unit/library/recording-db.ts`.
 */
export function createRecordingDatabase(results: unknown[][]) {
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
    database: database as unknown as SourceQueryDatabase,
    queries,
  };
}
