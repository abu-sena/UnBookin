import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { modules, unbooks } from '@/db/schema';
import type { Module, Unbook } from '@/db/schema';
import { z } from 'zod';
import { LearningError } from './errors';

/**
 * Server identity for every learning service call. It is always built from the
 * session user, never from client input.
 */
export const learningIdentitySchema = z.object({ userId: z.uuid() });
export type LearningIdentity = z.infer<typeof learningIdentitySchema>;

export type LearningTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Validate an identity value that was already built from `requireUser()`. */
export function assertIdentity(identity: LearningIdentity): LearningIdentity {
  const parsed = learningIdentitySchema.safeParse(identity);
  if (!parsed.success) throw new LearningError('invalidInput');
  return parsed.data;
}

/**
 * The module's owning unbook, locked for update inside a transaction. The
 * unbook must belong to the user and be `ready`; anything else is `notFound`
 * so the existence of other users' modules never leaks.
 */
export async function ownedReadyUnbook(
  tx: LearningTransaction,
  identity: LearningIdentity,
  moduleId: string,
): Promise<{ module: Module; unbook: Unbook }> {
  const [row] = await tx
    .select({ module: modules, unbook: unbooks })
    .from(modules)
    .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
    .where(and(eq(modules.id, moduleId), eq(unbooks.userId, identity.userId)))
    .for('update', { of: unbooks })
    .limit(1);
  if (!row || row.unbook.status !== 'ready') throw new LearningError('notFound');
  return row;
}

/** Read-only variant of `ownedReadyUnbook` for queries. */
export async function ownedReadyUnbookRead(
  identity: LearningIdentity,
  moduleId: string,
): Promise<{ module: Module; unbook: Unbook }> {
  const [row] = await db
    .select({ module: modules, unbook: unbooks })
    .from(modules)
    .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
    .where(and(eq(modules.id, moduleId), eq(unbooks.userId, identity.userId), eq(unbooks.status, 'ready')))
    .limit(1);
  if (!row) throw new LearningError('notFound');
  return row;
}
