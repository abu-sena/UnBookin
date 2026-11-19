import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

vi.mock('server-only', () => ({}));

import { deleteKey, getKeyStatus, loadPlainKey, markVerified, saveKey } from '@/lib/byok/store';

/**
 * REAL-DB BYOK store test. SKIPPED unless BYOK_DB_URL is set.
 * Safety: local host only and the database name must contain "test". A
 * throwaway master key is generated here, never read from `.env.local`.
 */
const URL_VALUE = process.env.BYOK_DB_URL ?? '';

function assertLocalTestDatabase(value: string): void {
  const parsed = new URL(value);
  const host = parsed.hostname;
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['127.0.0.1', 'localhost'].includes(host) || !name.includes('test')) {
    throw new Error('BYOK_DB_URL must be a local database whose name includes "test".');
  }
}

const PLAIN = 'sk-or-v1-realdb0123456789abcdef0123456789';
const suite = URL_VALUE ? describe : describe.skip;

suite('BYOK store (real DB)', () => {
  let client: ReturnType<typeof postgres>;
  let database: PostgresJsDatabase<typeof schema>;
  let userId: string;

  beforeAll(async () => {
    assertLocalTestDatabase(URL_VALUE);
    process.env.DATABASE_URL = URL_VALUE;
    process.env.BYOK_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.BYOK_ENCRYPTION_KEY_VERSION = '1';
    process.env.BYOK_ENCRYPTION_KEY_PREVIOUS = '';
    client = postgres(URL_VALUE, { prepare: false, max: 2 });
    database = drizzle(client, { schema, casing: 'snake_case' });

    userId = randomUUID();
    await database.insert(schema.users).values({ id: userId, name: 'BYOK Real DB' });
  });

  afterAll(async () => {
    if (database && userId) {
      await database.delete(schema.users).where(eq(schema.users.id, userId));
    }
    await client?.end({ timeout: 5 });
  });

  it('saves encrypted, reports safe status, reads back and deletes', async () => {
    await saveKey({ userId }, PLAIN, 'manual');

    const [row] = await database
      .select()
      .from(schema.byokKeys)
      .where(eq(schema.byokKeys.userId, userId));
    expect(row).toBeDefined();
    expect(row?.encryptedKey).not.toContain(PLAIN);
    expect(row?.last4).toBe(PLAIN.slice(-4));
    expect(row?.keyVersion).toBe(1);
    expect(row?.revokedAt).toBeNull();

    const status = await getKeyStatus({ userId });
    expect(status).toMatchObject({ connected: true, last4: PLAIN.slice(-4), via: 'manual' });

    expect(await loadPlainKey(userId)).toBe(PLAIN);

    await markVerified({ userId });
    expect((await getKeyStatus({ userId })).verifiedAt).toBeInstanceOf(Date);

    await deleteKey({ userId });
    const remaining = await database
      .select()
      .from(schema.byokKeys)
      .where(eq(schema.byokKeys.userId, userId));
    expect(remaining).toHaveLength(0);
    expect((await getKeyStatus({ userId })).connected).toBe(false);
  });
});
