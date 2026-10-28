import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A tiny fake transaction handle covering the calls `awardXp` makes:
 * `execute` for the advisory lock, `insert(table).values(v).onConflictDoNothing(config).returning()`
 * and `insert(table).values(v).onConflictDoUpdate(config)`.
 */
function createFakeTx() {
  const calls: {
    insertTable: unknown;
    values: unknown;
    conflict: unknown;
    returning: boolean;
  }[] = [];
  const executed: unknown[] = [];
  let returningResult: { id: string }[] = [];
  const tx = {
    async execute(query: unknown) {
      executed.push(query);
      return [];
    },
    insert(table: unknown) {
      return {
        values(values: unknown) {
          const entry = {
            insertTable: table,
            values,
            conflict: undefined as unknown,
            returning: false,
          };
          const builder = {
            onConflictDoNothing(config: unknown) {
              entry.conflict = config;
              return builder;
            },
            onConflictDoUpdate(config: unknown) {
              entry.conflict = config;
              calls.push(entry);
              return Promise.resolve();
            },
            returning() {
              entry.returning = true;
              calls.push(entry);
              return Promise.resolve(returningResult);
            },
          };
          return builder;
        },
      };
    },
  };
  return {
    tx,
    calls,
    executed,
    setReturning(value: { id: string }[]) {
      returningResult = value;
    },
    reset() {
      calls.length = 0;
      executed.length = 0;
      returningResult = [];
    },
    valuesOf(index: number) {
      return calls[index]?.values as Record<string, unknown>;
    },
  };
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/game/engine', () => ({ reconcileGame: vi.fn(async () => ({})) }));

const { awardXp, dailyRefId } = await import('@/lib/game/xp');
const { userStats, xpEvents } = await import('@/db/schema');
const { PgDialect } = await import('drizzle-orm/pg-core');
const { reconcileGame } = await import('@/lib/game/engine');
const dialect = new PgDialect({ casing: 'snake_case' });

const USER = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const REF = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

describe('awardXp with a fake transaction', () => {
  const fake = createFakeTx();
  beforeEach(() => {
    fake.reset();
    vi.mocked(reconcileGame).mockClear();
  });

  it('inserts the event with the idempotency target and upserts the total when new', async () => {
    fake.setReturning([{ id: 'event-1' }]);
    const result = await awardXp(fake.tx as never, {
      userId: USER,
      type: 'module_read',
      amount: 20,
      refType: 'module',
      refId: REF,
    });

    expect(result).toEqual({ awarded: true, amount: 20 });
    // Advisory lock first, then the derived reconcile on the SAME transaction handle.
    expect(fake.executed).toHaveLength(1);
    expect(dialect.sqlToQuery(fake.executed[0] as never)).toMatchObject({
      sql: 'select pg_advisory_xact_lock(hashtextextended($1, 0))',
      params: [`game:${USER}`],
    });
    expect(reconcileGame).toHaveBeenCalledTimes(1);
    expect(reconcileGame).toHaveBeenCalledWith(fake.tx, USER);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]!.insertTable).toBe(xpEvents);
    expect(fake.calls[0]!.returning).toBe(true);
    expect(fake.valuesOf(0)).toMatchObject({
      userId: USER,
      type: 'module_read',
      amount: 20,
      refType: 'module',
      refId: REF,
      domainId: null,
    });
    expect(fake.calls[1]!.insertTable).toBe(userStats);
    expect(fake.valuesOf(1)).toMatchObject({ userId: USER, totalXp: 20 });
    // The stats upsert must NOT have a returning clause.
    expect(fake.calls[1]!.returning).toBe(false);
  });

  it('is idempotent: no event row means no stats change and amount 0', async () => {
    fake.setReturning([]);
    const result = await awardXp(fake.tx as never, {
      userId: USER,
      type: 'module_read',
      amount: 20,
      refType: 'module',
      refId: REF,
    });

    expect(result).toEqual({ awarded: false, amount: 0 });
    // The lock is still taken before the insert; a replay never reconciles twice.
    expect(fake.executed).toHaveLength(1);
    expect(reconcileGame).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(1);
  });

  it('rejects non-positive amounts', async () => {
    for (const amount of [0, -5, 1.5]) {
      await expect(
        awardXp(fake.tx as never, {
          userId: USER,
          type: 'module_read',
          amount,
          refType: 'module',
          refId: REF,
        }),
      ).rejects.toThrow();
    }
    expect(fake.calls).toHaveLength(0);
  });
});

describe('dailyRefId', () => {
  it('is deterministic for the same user and local date', () => {
    const a = dailyRefId(USER, '2026-10-27');
    const b = dailyRefId(USER, '2026-10-27');
    expect(a).toBe(b);
  });

  it('differs per user and per local day', () => {
    const other = '9f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
    expect(dailyRefId(USER, '2026-10-27')).not.toBe(dailyRefId(USER, '2026-10-28'));
    expect(dailyRefId(USER, '2026-10-27')).not.toBe(dailyRefId(other, '2026-10-27'));
  });

  it('returns a valid UUIDv5-shaped string', () => {
    const id = dailyRefId(USER, '2026-10-27');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('rejects empty parts', () => {
    expect(() => dailyRefId('', '2026-10-27')).toThrow();
    expect(() => dailyRefId(USER, '')).toThrow();
  });
});
