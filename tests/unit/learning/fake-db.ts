import { vi } from 'vitest';

export type RecordedSelect = {
  table: unknown;
  fields: unknown;
  joins: unknown[];
  locked: boolean;
  limited: boolean;
};

export type RecordedWrite = {
  table: unknown;
  values?: unknown;
  set?: unknown;
  conflict?: unknown;
  returning?: boolean;
};

export type RecordedFakeQueries = {
  selects: RecordedSelect[];
  inserts: RecordedWrite[];
  updates: RecordedWrite[];
  deletes: RecordedWrite[];
  transactionCount: number;
};

/**
 * Chainable fake for the learning services: every executed query consumes the
 * next entry of `results` and is recorded. Covers the chain shapes used by
 * `lib/learning` (select joins/where/orderBy/limit/for, insert
 * onConflictDoNothing/DoUpdate with optional returning, update set/where).
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

  const select = vi.fn((fields: unknown) => ({
    from: (table: unknown) => {
      const state: RecordedSelect = { table, fields: fields ?? null, joins: [], locked: false, limited: false };
      const chain = {
        innerJoin: (joined: unknown) => {
          state.joins.push(joined);
          return chain;
        },
        leftJoin: (joined: unknown) => {
          state.joins.push(joined);
          return chain;
        },
        where: (...rest: unknown[]) => { void rest; return chain; },
        orderBy: (...rest: unknown[]) => { void rest; return chain; },
        limit: (n: number) => {
          void n;
          state.limited = true;
          recorded.selects.push(state);
          return Promise.resolve(nextRows());
        },
        for: (...rest: unknown[]) => {
          void rest;
          state.locked = true;
          // `.for()` is chainable; the await still goes through `.then`/limit.
          return chain;
        },
        then: (
          resolve: (value: unknown[]) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => {
          recorded.selects.push(state);
          return Promise.resolve(nextRows()).then(resolve, reject);
        },
      };
      return chain;
    },
  }));

  const insert = vi.fn((table: unknown) => ({
    values: (values: unknown) => {
      const entry: RecordedWrite = { table, values };
      const record = () => {
        if (!recorded.inserts.includes(entry)) {
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
            // Awaiting without `.returning()` resolves to no rows (no-op insert).
            then: (
              resolve?: (value: unknown[]) => unknown,
              reject?: (reason: unknown) => unknown,
            ) => Promise.resolve([] as unknown[]).then(resolve, reject),
          };
        },
        onConflictDoUpdate: (config: unknown) => {
          entry.conflict = config;
          record();
          return {
            then: (resolve?: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
              Promise.resolve([] as unknown[]).then(resolve, reject),
          };
        },
        returning: () => {
          entry.returning = true;
          record();
          return Promise.resolve(nextRows());
        },
      };
      return chain;
    },
  }));

  const update = vi.fn((table: unknown) => ({
    set: (set: unknown) => {
      const entry: RecordedWrite = { table, set };
      return {
        where: (...rest: unknown[]) => {
          void rest;
          recorded.updates.push(entry);
          return Promise.resolve();
        },
        returning: () => {
          recorded.updates.push(entry);
          return Promise.resolve(nextRows());
        },
      };
    },
  }));

  const del = vi.fn((table: unknown) => ({
    where: (...rest: unknown[]) => {
      void rest;
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

export type FakeDatabaseApi = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

export const fake = createFakeDatabase();
