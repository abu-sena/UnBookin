import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  conflict: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  del: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
    update: mocks.update,
    delete: mocks.del,
  },
}));

import { deleteKey, getKeyStatus, loadPlainKey, markVerified, saveKey } from '@/lib/byok/store';

const USER_ID = randomUUID();
const PLAIN = 'sk-or-v1-abcdef0123456789abcdef0123456789';

beforeEach(() => {
  vi.stubEnv('BYOK_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('BYOK_ENCRYPTION_KEY_VERSION', '1');
  vi.stubEnv('BYOK_ENCRYPTION_KEY_PREVIOUS', '');

  mocks.conflict.mockResolvedValue(undefined);
  mocks.values.mockReset().mockReturnValue({ onConflictDoUpdate: mocks.conflict });
  mocks.insert.mockReset().mockReturnValue({ values: mocks.values });
  mocks.limit.mockReset().mockResolvedValue([]);
  mocks.where.mockReset().mockReturnValue({ limit: mocks.limit });
  mocks.from.mockReset().mockReturnValue({ where: mocks.where });
  mocks.select.mockReset().mockReturnValue({ from: mocks.from });
  mocks.updateWhere.mockReset().mockResolvedValue(undefined);
  mocks.set.mockReset().mockReturnValue({ where: mocks.updateWhere });
  mocks.update.mockReset().mockReturnValue({ set: mocks.set });
  mocks.del.mockReset().mockReturnValue({ where: mocks.updateWhere });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('byok store', () => {
  it('encrypts on save, upserts one row and clears revocation', async () => {
    const { last4 } = await saveKey({ userId: USER_ID }, PLAIN, 'manual');
    expect(last4).toBe(PLAIN.slice(-4));

    const values = mocks.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(values).toMatchObject({
      userId: USER_ID,
      last4: PLAIN.slice(-4),
      connectedVia: 'manual',
      verifiedAt: null,
      revokedAt: null,
      keyVersion: 1,
    });
    expect(values.encryptedKey).not.toContain(PLAIN);
    const conflict = mocks.conflict.mock.calls[0]?.[0] as { set: Record<string, unknown> };
    expect(conflict.set.revokedAt).toBeNull();
    expect(JSON.stringify(conflict.set)).not.toContain(PLAIN);
  });

  it('returns only client-safe status fields and never ciphertext', async () => {
    const verifiedAt = new Date('2026-11-19T10:00:00.000Z');
    mocks.limit.mockResolvedValue([
      { last4: '6789', connectedVia: 'oauth', verifiedAt, revokedAt: null },
    ]);

    const status = await getKeyStatus({ userId: USER_ID });
    expect(status).toEqual({
      connected: true,
      last4: '6789',
      via: 'oauth',
      verifiedAt,
    });
    expect(Object.keys(status).sort()).toEqual(['connected', 'last4', 'verifiedAt', 'via']);
    expect(JSON.stringify(status)).not.toMatch(/encrypted|authTag|sk-or/);
  });

  it('reports a revoked row as disconnected', async () => {
    mocks.limit.mockResolvedValue([
      { last4: '6789', connectedVia: 'manual', verifiedAt: null, revokedAt: new Date() },
    ]);
    expect(await getKeyStatus({ userId: USER_ID })).toEqual({
      connected: false,
      last4: null,
      via: null,
      verifiedAt: null,
    });
  });

  it('loads the plain key for server use only', async () => {
    await saveKey({ userId: USER_ID }, PLAIN, 'manual');
    const stored = mocks.values.mock.calls[0]?.[0] as Record<string, unknown>;
    mocks.limit.mockResolvedValue([{ ...stored, revokedAt: null }]);

    expect(await loadPlainKey(USER_ID)).toBe(PLAIN);
  });

  it('hard deletes the row and marks verification', async () => {
    await deleteKey({ userId: USER_ID });
    expect(mocks.del).toHaveBeenCalledTimes(1);
    expect(mocks.updateWhere).toHaveBeenCalledTimes(1);

    const at = new Date('2026-11-19T11:00:00.000Z');
    await markVerified({ userId: USER_ID }, at);
    expect(mocks.set).toHaveBeenCalledWith({ verifiedAt: at });
  });
});
