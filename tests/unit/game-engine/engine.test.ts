import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {} }));

const schema = await import('@/db/schema');
const { PgDialect } = await import('drizzle-orm/pg-core');
const { reconcileGame } = await import('@/lib/game/engine');
const dialect = new PgDialect({ casing: 'snake_case' });

const USER = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const MODULE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const FOREIGN_MODULE = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const DOMAIN_A = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const DOMAIN_B = 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const NOW = new Date('2026-10-28T05:00:00.000Z'); // Wednesday, Asia/Jakarta noon

type Row = Record<string, unknown>;
type Insert = { table: unknown; values: Row | Row[] };

/**
 * Table-keyed fake transaction. Each `select().from(table)` consumes the next
 * queued result for that table in call order (falling back to `[]`), which is
 * the order `reconcileGame` issues its reads. It records writes and the order of
 * `execute` (advisory lock) versus reads.
 */
function createTx() {
  const queues = new Map<unknown, Row[][]>();
  const inserts: Insert[] = [];
  const events: string[] = [];
  const executed: unknown[] = [];

  const queue = (table: unknown, ...results: Row[][]) => {
    queues.set(table, [...(queues.get(table) ?? []), ...results]);
  };

  const select = () => ({
    from(table: unknown) {
      events.push('select');
      const result = queues.get(table)?.shift() ?? [];
      const builder: Record<string, unknown> = {
        innerJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => builder,
        then: (resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  });

  const tx = {
    async execute(query: unknown) {
      events.push('execute');
      executed.push(query);
      return [];
    },
    select,
    selectDistinct: select,
    insert(table: unknown) {
      return {
        values(values: Row | Row[]) {
          inserts.push({ table, values });
          const builder: Record<string, unknown> = {
            onConflictDoNothing: () => builder,
            onConflictDoUpdate: () => builder,
            returning: async () => [{ id: `row-${inserts.length}` }],
            then: (resolve: (value: unknown) => unknown) => Promise.resolve([]).then(resolve),
          };
          return builder;
        },
      };
    },
    update() {
      return { set: () => ({ where: async () => [] }) };
    },
  };

  const insertsFor = (table: unknown) =>
    inserts.filter((entry) => entry.table === table).map((entry) => entry.values);
  return { tx: tx as never, queue, inserts, insertsFor, events, executed };
}

const event = (
  type: string,
  refType: string,
  refId: string,
  amount: number,
  createdAt: string,
) => ({
  type,
  refType,
  refId,
  amount,
  createdAt: new Date(createdAt),
});

function seedBase(fake: ReturnType<typeof createTx>, ledger: Row[]) {
  fake.queue(schema.users, [{ createdAt: new Date('2026-10-01T00:00:00Z') }]);
  fake.queue(schema.profiles, [{ timezone: 'Asia/Jakarta' }]);
  fake.queue(schema.xpEvents, ledger);
}

describe('reconcileGame guards', () => {
  it('rejects malformed ids and dates before touching the transaction', async () => {
    const fake = createTx();
    await expect(reconcileGame(fake.tx, 'not-a-uuid', NOW)).rejects.toThrow('invalidUserId');
    await expect(reconcileGame(fake.tx, USER, new Date('nope'))).rejects.toThrow('invalidDate');
    expect(fake.events).toEqual([]);
  });

  it('takes the per-user game advisory lock before any read or write', async () => {
    const fake = createTx();
    await reconcileGame(fake.tx, USER, NOW); // unknown user: neutral state, no writes
    expect(fake.events[0]).toBe('execute');
    expect(dialect.sqlToQuery(fake.executed[0] as never)).toMatchObject({
      sql: 'select pg_advisory_xact_lock(hashtextextended($1, 0))',
      params: [`game:${USER}`],
    });
    expect(fake.inserts).toHaveLength(0);
  });

  it('never locks unbooks or actions (game scope only)', async () => {
    const fake = createTx();
    seedBase(fake, []);
    await reconcileGame(fake.tx, USER, NOW);
    expect(fake.executed).toHaveLength(1);
  });
});

describe('first Unbook backfill', () => {
  let fake: ReturnType<typeof createTx>;
  beforeEach(() => {
    fake = createTx();
  });

  it('inserts 50 XP once, dated at the earliest ready Unbook, never "today"', async () => {
    seedBase(fake, [event('module_read', 'module', MODULE, 20, '2026-10-20T03:00:00Z')]);
    fake.queue(schema.unbooks, [
      {
        completedAt: new Date('2026-10-15T02:00:00Z'),
        updatedAt: new Date('2026-10-27T00:00:00Z'),
      },
      { completedAt: null, updatedAt: new Date('2026-10-10T02:00:00Z') },
    ]);
    await reconcileGame(fake.tx, USER, NOW);

    const [first] = fake.insertsFor(schema.xpEvents) as Row[];
    expect(first).toMatchObject({
      userId: USER,
      type: 'first_unbook',
      amount: 50,
      refType: 'user',
      refId: USER,
    });
    expect((first!.createdAt as Date).toISOString()).toBe('2026-10-10T02:00:00.000Z');
    const [stats] = fake.insertsFor(schema.userStats) as Row[];
    expect(stats).toMatchObject({ userId: USER, totalXp: 70 });
  });

  it('does not backfill again when the ledger already has it or no Unbook is ready', async () => {
    seedBase(fake, [event('first_unbook', 'user', USER, 50, '2026-10-10T00:00:00Z')]);
    await reconcileGame(fake.tx, USER, NOW);
    expect(fake.insertsFor(schema.xpEvents)).toHaveLength(0);

    const empty = createTx();
    seedBase(empty, []);
    await reconcileGame(empty.tx, USER, NOW);
    expect(empty.insertsFor(schema.xpEvents)).toHaveLength(0);
  });
});

describe('domain XP', () => {
  it('splits module XP by confidence, ignores non-module and foreign events, counts a quiz once', async () => {
    const fake = createTx();
    seedBase(fake, [
      event('module_read', 'module', MODULE, 20, '2026-10-26T03:00:00Z'),
      event('quiz_pass', 'module_quiz', MODULE, 30, '2026-10-26T03:10:00Z'),
      event('quiz_perfect', 'module_quiz', MODULE, 10, '2026-10-26T03:10:00Z'),
      event('module_read', 'module', FOREIGN_MODULE, 20, '2026-10-26T04:00:00Z'),
      event(
        'review_daily',
        'review',
        'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        10,
        '2026-10-26T05:00:00Z',
      ),
      event('first_unbook', 'user', USER, 50, '2026-10-20T00:00:00Z'),
    ]);
    // Ownership select returns only MODULE; the foreign one is filtered by user in SQL.
    fake.queue(schema.modules, [{ id: MODULE }]);
    fake.queue(schema.moduleDomains, [
      { moduleId: MODULE, domainId: DOMAIN_A, confidence: 0.7 },
      { moduleId: MODULE, domainId: DOMAIN_B, confidence: 0.3 },
    ]);
    await reconcileGame(fake.tx, USER, NOW);

    const progress = fake.insertsFor(schema.domainProgress) as Row[];
    const byDomain = new Map(progress.map((row) => [row.domainId, row]));
    // 60 module-bound XP (20 + 30 + 10): 70% = 42, 30% = 18. Never 60 each.
    expect(byDomain.get(DOMAIN_A)).toMatchObject({ xp: 42, verifiedActions: 0 });
    expect(byDomain.get(DOMAIN_B)).toMatchObject({ xp: 18, verifiedActions: 0 });
    // user_stats total is the whole ledger and is never multiplied per domain.
    expect(fake.insertsFor(schema.userStats)[0]).toMatchObject({ totalXp: 140 });
  });
});

describe('weekly missions', () => {
  const TEMPLATES = [
    { id: 't-learn', slug: 'learn-1', type: 'learn', target: 1, xpReward: 30 },
    { id: 't-review', slug: 'review-9', type: 'review', target: 9, xpReward: 30 },
    { id: 't-apply', slug: 'apply-9', type: 'apply', target: 9, xpReward: 30 },
  ];

  it('completes a learn mission once, awards its reward at now and does not extend the streak', async () => {
    const fake = createTx();
    seedBase(fake, [event('module_read', 'module', MODULE, 20, '2026-10-27T03:00:00Z')]);
    fake.queue(schema.missionTemplates, TEMPLATES);
    await reconcileGame(fake.tx, USER, NOW);

    const missions = fake.insertsFor(schema.userMissions) as Row[];
    expect(missions).toHaveLength(3); // exactly one per type
    expect(missions.find((row) => row.templateId === 't-learn')).toMatchObject({
      weekStart: '2026-10-26',
      progress: 1,
    });
    expect(missions.filter((row) => row.completedAt)).toHaveLength(1);

    const rewards = (fake.insertsFor(schema.xpEvents) as Row[]).filter(
      (row) => row.type === 'weekly_mission',
    );
    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({ amount: 30, refType: 'mission' });
    expect((rewards[0]!.createdAt as Date).toISOString()).toBe(NOW.toISOString());
    // 20 (module) + 30 (mission); only the module day (Tue) is active, not the mission day (Wed).
    expect(fake.insertsFor(schema.userStats)[0]).toMatchObject({
      totalXp: 50,
      currentStreak: 1,
      lastActiveDate: '2026-10-27',
    });
  });

  it('counts distinct reported actions for apply, even a low score, and caps at target', async () => {
    const fake = createTx();
    const actionA = 'f1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    seedBase(fake, []);
    fake.queue(schema.missionTemplates, [
      { ...TEMPLATES[2]!, target: 1 },
      TEMPLATES[0]!,
      TEMPLATES[1]!,
    ]);
    fake.queue(schema.actionReports, [
      { actionId: actionA, createdAt: new Date('2026-10-27T02:00:00Z') },
      { actionId: actionA, createdAt: new Date('2026-10-28T02:00:00Z') },
      { actionId: 'g-old', createdAt: new Date('2026-10-18T02:00:00Z') }, // previous week
    ]);
    await reconcileGame(fake.tx, USER, NOW);

    const apply = (fake.insertsFor(schema.userMissions) as Row[]).find(
      (row) => row.templateId === 't-apply',
    );
    expect(apply).toMatchObject({ progress: 1 });
    expect(apply?.completedAt).toBeInstanceOf(Date);
  });
});
