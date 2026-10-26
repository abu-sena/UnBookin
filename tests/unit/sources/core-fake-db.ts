import { vi } from 'vitest';

export type RecordedFakeQueries = {
  selects: { table: unknown; forUpdate: boolean; limited: boolean }[];
  inserts: { table: unknown; values: unknown }[];
  updates: { table: unknown; set: unknown }[];
  deletes: { table: unknown }[];
  transactionCount: number;
};

export type FakeDatabaseApi = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

/**
 * Purposeful transaction mock for the source store/lifecycle flows: a shared
 * chainable API used for both `db` and the transaction handle (like
 * `db.transaction((tx) => cb(tx))`). Each query execution consumes the next
 * entry of `fake.results`; every call is recorded so tests can assert table
 * identity, `.for('update')` locks, inserted values and the transaction
 * boundary. Defined as a singleton so `vi.mock('@/db')` factories can import
 * it lazily at factory-run time (after hoisting).
 */
function createFakeDatabase() {
  const recorded: RecordedFakeQueries = {
    selects: [],
    inserts: [],
    updates: [],
    deletes: [],
    transactionCount: 0,
  };
  const results: unknown[][] = [];
  let cursor = 0;
  const nextRows = (): unknown[] => {
    const rows = results[cursor];
    cursor += 1;
    return rows ?? [];
  };

  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: (condition: unknown) => {
        void condition;
        const state = { table, forUpdate: false, limited: false };
        return {
          for: (mode: string) => {
            void mode;
            state.forUpdate = true;
            recorded.selects.push(state);
            return Promise.resolve(nextRows());
          },
          limit: (n: number) => {
            void n;
            state.limited = true;
            recorded.selects.push(state);
            return Promise.resolve(nextRows());
          },
          then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => {
            recorded.selects.push(state);
            return Promise.resolve(nextRows()).then(resolve, reject);
          },
        };
      },
    }),
  }));

  const insert = vi.fn((table: unknown) => ({
    values: (values: unknown) => {
      recorded.inserts.push({ table, values });
      return {
        returning: () => Promise.resolve(nextRows()),
        then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(nextRows()).then(resolve, reject),
      };
    },
  }));

  const update = vi.fn((table: unknown) => ({
    set: (set: unknown) => {
      recorded.updates.push({ table, set });
      return {
        where: (condition: unknown) => {
          void condition;
          return {
            returning: () => Promise.resolve(nextRows()),
            then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
              Promise.resolve(nextRows()).then(resolve, reject),
          };
        },
      };
    },
  }));

  const del = vi.fn((table: unknown) => ({
    where: (condition: unknown) => {
      void condition;
      recorded.deletes.push({ table });
      return Promise.resolve(nextRows());
    },
  }));

  const transaction = vi.fn(async (callback: (tx: FakeDatabaseApi) => unknown) => {
    recorded.transactionCount += 1;
    return callback(api);
  });

  const api: FakeDatabaseApi = { select, insert, update, delete: del, transaction };

  return {
    db: api,
    tx: api,
    recorded,
    results,
    reset() {
      recorded.selects.length = 0;
      recorded.inserts.length = 0;
      recorded.updates.length = 0;
      recorded.deletes.length = 0;
      recorded.transactionCount = 0;
      results.length = 0;
      cursor = 0;
      select.mockClear();
      insert.mockClear();
      update.mockClear();
      del.mockClear();
      transaction.mockClear();
    },
  };
}

export const fake = createFakeDatabase();
