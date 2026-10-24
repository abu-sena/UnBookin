import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { waitlist } from '@/db/schema';

export function computePosition(baseRank: number, referralCount: number): number {
  return Math.max(1, baseRank - 10 * referralCount);
}

export async function getWaitlistPosition(id: string): Promise<number> {
  const entry = alias(waitlist, 'entry');
  // Keep explicit outer qualifiers: Drizzle's select-field mapping strips column qualifiers
  // inside SQL expressions, which would otherwise bind these references to the inner rows.
  const [row] = await db
    .select({
      baseRank: sql<number>`(select count(*)::int from waitlist w where (w.created_at, w.id) <= ("entry"."created_at", "entry"."id"))`,
      referralCount: sql<number>`(select count(*)::int from waitlist r where r.referred_by = "entry"."id")`,
    })
    .from(entry)
    .where(eq(entry.id, id));
  if (!row) throw new Error('Waitlist entry not found');
  return computePosition(Number(row.baseRank), Number(row.referralCount));
}
