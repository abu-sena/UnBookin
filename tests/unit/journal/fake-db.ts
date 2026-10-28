import { PgDialect } from 'drizzle-orm/pg-core';
import { vi } from 'vitest';

export type RecordedSelect = {
  table: unknown;
  fields: unknown;
  joins: { table: unknown; condition: unknown }[];
  where: unknown;
  orderBy: unknown[];
  locked: boolean;
  lock: unknown;
  limited: boolean;
};

export type RecordedWrite = {
  table: unknown;
  values?: unknown;
  set?: unknown;
  conflict?: unknown;
  returning?: boolean;
  where?: unknown;
};

export type RecordedJournalQueries = {
  selects: RecordedSelect[];
  inserts: RecordedWrite[];
  updates: RecordedWrite[];
  transactionCount: number;
};

const dialect = new PgDialect({ casing: 'snake_case' });

/** Render a recorded Drizzle condition/expression to the SQL it would send. */
export function renderSql(value: unknown): { sql: string; params: unknown[] } {
  if (!value) return { sql: '', params: [] };
  return dialect.sqlToQuery(value as never);
}

function createFakeDatabase() {
  const recorded: RecordedJournalQueries = {
    selects: [],
    inserts: [],
    updates: [],
    transactionCount: 0,
  };
  const results: unknown[][] = [];
  let cursor = 0;
  const nextRows = (): unknown[] => {
    const rows = results[cursor];
    cursor += 1;
    return rows ?? [];
  };

  const select = vi.fn((fields: unknown) => ({
    from: (table: unknown) => {
      const state: RecordedSelect = {
        table,
        fields: fields ?? null,
        joins: [],
        where: undefined,
        orderBy: [],
        locked: false,
        lock: undefined,
        limited: false,
      };
      const finish = () => {
        recorded.selects.push(state);
        return Promise.resolve(nextRows());
      };
      const chain = {
        innerJoin: (joined: unknown, condition?: unknown) => {
          state.joins.push({ table: joined, condition });
          return chain;
        },
        leftJoin: (joined: unknown, condition?: unknown) => {
          state.joins.push({ table: joined, condition });
          return chain;
        },
        where: (condition: unknown) => {
          state.where = condition;
          return chain;
        },
        orderBy: (...args: unknown[]) => {
          state.orderBy = args;
          return chain;
        },
        limit: (n: number) => {
          void n;
          state.limited = true;
          return finish();
        },
        for: (...args: unknown[]) => {
          state.locked = true;
          state.lock = args;
          return chain;
        },
        then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
          finish().then(resolve, reject),
      };
      return chain;
    },
  }));

  const insert = vi.fn((table: unknown) => ({
    values: (values: unknown) => {
      const entry: RecordedWrite = { table, values };
      let recordedOnce = false;
      const record = () => {
        if (!recordedOnce) {
          recordedOnce = true;
          recorded.inserts.push(entry);
        }
      };
      const chain = {
        onConflictDoNothing: (config: unknown) => {
          entry.conflict = config;
          record();
          return {
            returning: () => {
              entry.returning = true;
              return Promise.resolve(nextRows());
            },
            then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
              Promise.resolve([] as unknown[]).then(resolve, reject),
          };
        },
        onConflictDoUpdate: (config: unknown) => {
          entry.conflict = config;
          record();
          return {
            then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
              Promise.resolve([] as unknown[]).then(resolve, reject),
          };
        },
        returning: () => {
          entry.returning = true;
          record();
          return Promise.resolve(nextRows());
        },
        then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => {
          record();
          return Promise.resolve([] as unknown[]).then(resolve, reject);
        },
      };
      return chain;
    },
  }));

  const update = vi.fn((table: unknown) => ({
    set: (set: unknown) => {
      const entry: RecordedWrite = { table, set };
      return {
        where: (condition: unknown) => {
          entry.where = condition;
          recorded.updates.push(entry);
          return Promise.resolve();
        },
      };
    },
  }));

  const transaction = vi.fn(async (callback: (tx: FakeDatabaseApi) => unknown) => {
    recorded.transactionCount += 1;
    return callback(api);
  });

  const api: FakeDatabaseApi = {
    select,
    insert,
    update,
    transaction,
  };

  return {
    db: api,
    tx: api,
    recorded,
    results,
    reset() {
      recorded.selects.length = 0;
      recorded.inserts.length = 0;
      recorded.updates.length = 0;
      recorded.transactionCount = 0;
      results.length = 0;
      cursor = 0;
      select.mockClear();
      insert.mockClear();
      update.mockClear();
      transaction.mockClear();
    },
  };
}

export type FakeDatabaseApi = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

export const fake = createFakeDatabase();
