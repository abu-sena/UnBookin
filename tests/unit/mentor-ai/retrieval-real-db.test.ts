import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const mocks = vi.hoisted(() => ({ runTask: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai/run-task', () => ({ runTask: mocks.runTask }));

/**
 * REAL-DB integration for mentor retrieval. SKIPPED unless MENTOR_DB_URL is set.
 * Safety: the URL must point to 127.0.0.1/localhost AND a database whose name
 * contains "test"; anything else is refused. Every fixture uses fresh UUIDs and
 * only those ids are removed in `finally`.
 */
const URL_VALUE = process.env.MENTOR_DB_URL ?? '';

function assertLocalTestDatabase(value: string): void {
  const parsed = new URL(value);
  const host = parsed.hostname;
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['127.0.0.1', 'localhost'].includes(host) || !name.includes('test')) {
    throw new Error('MENTOR_DB_URL must be a local database whose name includes "test".');
  }
}

function vector(position: number): number[] {
  return Array.from({ length: 1536 }, (_, index) => (index === position ? 1 : 0));
}

describe.skipIf(!URL_VALUE)('mentor retrieval real-DB integration (isolated local DB)', () => {
  it('filters by source id in hybrid and text modes', async () => {
    assertLocalTestDatabase(URL_VALUE);
    const inherited = process.env.DATABASE_URL;
    if (inherited && inherited !== URL_VALUE) {
      throw new Error('DATABASE_URL must be unset or equal to MENTOR_DB_URL for this test.');
    }
    process.env.DATABASE_URL = URL_VALUE;

    const schema = await import('@/db/schema');
    const { retrieveChunks } = await import('@/lib/mentor/retrieval');
    const client = postgres(URL_VALUE, { prepare: false, max: 2 });
    const db = drizzle(client, { schema, casing: 'snake_case' });

    const userId = randomUUID();
    const sourceA = randomUUID();
    const sourceB = randomUUID();
    const sourceIds = [sourceA, sourceB];

    try {
      await db.insert(schema.users).values({ id: userId, name: 'M7 Mentor Check' });
      for (const sourceId of sourceIds) {
        await db.insert(schema.sources).values({
          id: sourceId,
          userId,
          type: 'text',
          title: `M7 ${sourceId.slice(0, 4)}`,
          rightsConfirmedAt: new Date('2026-11-03T00:00:00Z'),
        });
      }
      await db.insert(schema.sourceChunks).values([
        {
          sourceId: sourceA,
          idx: 1,
          text: 'kepemimpinan strategis untuk tim',
          tokenCount: 10,
          pageFrom: 4,
          pageTo: 5,
          embedding: vector(0),
        },
        {
          sourceId: sourceB,
          idx: 1,
          text: 'kebiasaan produktivitas harian',
          tokenCount: 10,
          pageFrom: 8,
          pageTo: 9,
          embedding: vector(1),
        },
      ]);

      mocks.runTask.mockResolvedValue({ embeddings: [vector(0)], costUsd: null });
      const hybrid = await retrieveChunks({
        sourceId: sourceA,
        question: 'kepemimpinan',
        userId,
      });
      expect(hybrid.mode).toBe('hybrid');
      expect(hybrid.chunks.length).toBeGreaterThan(0);
      expect(hybrid.chunks.every((chunk) => chunk.text.includes('kepemimpinan'))).toBe(true);
      expect(hybrid.chunks.some((chunk) => chunk.text.includes('kebiasaan'))).toBe(false);

      const other = await retrieveChunks({ sourceId: sourceB, question: 'produktivitas', userId });
      expect(other.chunks.some((chunk) => chunk.text.includes('kepemimpinan'))).toBe(false);

      mocks.runTask.mockRejectedValue(new Error('embedding down'));
      const textOnly = await retrieveChunks({
        sourceId: sourceA,
        question: 'kepemimpinan',
        userId,
      });
      expect(textOnly.mode).toBe('text');
      expect(textOnly.chunks.every((chunk) => chunk.text.includes('kepemimpinan'))).toBe(true);

      const crossed = await retrieveChunks({ sourceId: sourceA, question: 'kebiasaan', userId });
      expect(crossed).toEqual({ chunks: [], mode: 'text' });
    } finally {
      await db.delete(schema.sources).where(inArray(schema.sources.id, sourceIds));
      await db.delete(schema.users).where(eq(schema.users.id, userId));
      await client.end({ timeout: 5 });
    }
  });
});
