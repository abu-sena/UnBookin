import 'server-only';
import { sql } from 'drizzle-orm';

/** Minimal transaction surface needed to take the game-scope advisory lock. */
export type GameLockTransaction = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

/**
 * Serialize every game write for one user. The lock is transaction-scoped and
 * re-entrant, so `awardXp` can hold it while the derived reconciliation runs in
 * the same transaction. It is taken AFTER any unbook/action locks, which keeps
 * the global lock order (unbooks/actions -> game) free of inversions.
 */
export async function acquireGameLock(tx: GameLockTransaction, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`game:${userId}`}, 0))`);
}
