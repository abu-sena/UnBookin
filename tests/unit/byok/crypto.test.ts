import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { decryptKey, encryptKey, type EncryptedKey } from '@/lib/crypto/byok';

const KEY_A = randomBytes(32).toString('base64');
const KEY_B = randomBytes(32).toString('base64');
const PLAIN = 'sk-or-v1-0123456789abcdef0123456789abcdef';

function tamper(row: EncryptedKey, field: keyof EncryptedKey): EncryptedKey {
  const bytes = Buffer.from(String(row[field]), 'base64');
  bytes[0] = (bytes[0] ?? 0) ^ 0xff;
  return { ...row, [field]: bytes.toString('base64') };
}

beforeEach(() => {
  vi.stubEnv('BYOK_ENCRYPTION_KEY', KEY_A);
  vi.stubEnv('BYOK_ENCRYPTION_KEY_VERSION', '1');
  vi.stubEnv('BYOK_ENCRYPTION_KEY_PREVIOUS', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('byok crypto', () => {
  it('round trips a plain key with a random 12-byte IV and 16-byte tag', () => {
    const first = encryptKey(PLAIN);
    const second = encryptKey(PLAIN);
    expect(decryptKey(first)).toBe(PLAIN);
    expect(first.keyVersion).toBe(1);
    expect(Buffer.from(first.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(first.authTag, 'base64')).toHaveLength(16);
    expect(first.iv).not.toBe(second.iv);
    expect(first.encryptedKey).not.toContain(PLAIN);
  });

  it('fails safely when the master key, tag, IV or ciphertext is wrong', () => {
    const row = encryptKey(PLAIN);

    vi.stubEnv('BYOK_ENCRYPTION_KEY', KEY_B);
    expect(() => decryptKey(row)).toThrow(expect.objectContaining({ code: 'byokKeyRejected' }));

    vi.stubEnv('BYOK_ENCRYPTION_KEY', KEY_A);
    for (const field of ['iv', 'authTag', 'encryptedKey'] as const) {
      expect(() => decryptKey(tamper(row, field))).toThrow(
        expect.objectContaining({ code: 'byokKeyRejected' }),
      );
    }
    try {
      decryptKey(tamper(row, 'authTag'));
    } catch (error) {
      expect(String(error)).not.toContain(PLAIN);
    }
  });

  it('reads rows encrypted with the previous key after rotation', () => {
    const oldRow = encryptKey(PLAIN);

    vi.stubEnv('BYOK_ENCRYPTION_KEY_VERSION', '2');
    vi.stubEnv('BYOK_ENCRYPTION_KEY', KEY_B);
    vi.stubEnv('BYOK_ENCRYPTION_KEY_PREVIOUS', KEY_A);
    expect(decryptKey(oldRow)).toBe(PLAIN);

    const newRow = encryptKey(PLAIN);
    expect(newRow.keyVersion).toBe(2);
    expect(decryptKey(newRow)).toBe(PLAIN);

    vi.stubEnv('BYOK_ENCRYPTION_KEY_PREVIOUS', '');
    expect(() => decryptKey(oldRow)).toThrow(
      expect.objectContaining({ code: 'configurationMissing' }),
    );
  });

  it('rejects a missing, short or non-base64 master key', () => {
    vi.stubEnv('BYOK_ENCRYPTION_KEY', '');
    expect(() => encryptKey(PLAIN)).toThrow(
      expect.objectContaining({ code: 'configurationMissing' }),
    );

    vi.stubEnv('BYOK_ENCRYPTION_KEY', randomBytes(16).toString('base64'));
    expect(() => encryptKey(PLAIN)).toThrow(
      expect.objectContaining({ code: 'configurationMissing' }),
    );

    vi.stubEnv('BYOK_ENCRYPTION_KEY', 'not base64!!');
    expect(() => encryptKey(PLAIN)).toThrow(
      expect.objectContaining({ code: 'configurationMissing' }),
    );
  });
});
