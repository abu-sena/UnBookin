import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { SourceError } from '@/lib/sources/errors';

/**
 * BYOK key envelope encryption (PRD §11). AES-256-GCM with a random 12-byte IV
 * and a 16-byte authentication tag. The master key comes from
 * `BYOK_ENCRYPTION_KEY` (base64, exactly 32 bytes); `BYOK_ENCRYPTION_KEY_VERSION`
 * names the version written now, and `BYOK_ENCRYPTION_KEY_PREVIOUS` still
 * decrypts rows created before a rotation. Plain keys never leave this module
 * and are never part of an error message.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEFAULT_KEY_VERSION = 1;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export type EncryptedKey = {
  encryptedKey: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

function decodeMasterKey(value: string | undefined): Buffer | null {
  const raw = value?.trim();
  if (!raw || !BASE64_PATTERN.test(raw)) return null;
  const decoded = Buffer.from(raw, 'base64');
  return decoded.length === KEY_BYTES ? decoded : null;
}

function readCurrentVersion(): number | null {
  const raw = process.env.BYOK_ENCRYPTION_KEY_VERSION?.trim();
  if (!raw) return DEFAULT_KEY_VERSION;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function currentMasterKey(): { version: number; key: Buffer } {
  const version = readCurrentVersion();
  const key = decodeMasterKey(process.env.BYOK_ENCRYPTION_KEY);
  if (version === null || !key) throw new SourceError('configurationMissing');
  return { version, key };
}

function masterKeyForVersion(keyVersion: number): Buffer {
  const current = currentMasterKey();
  if (keyVersion === current.version) return current.key;
  if (keyVersion === current.version - 1) {
    const previous = decodeMasterKey(process.env.BYOK_ENCRYPTION_KEY_PREVIOUS);
    if (previous) return previous;
  }
  throw new SourceError('configurationMissing');
}

function decodeField(value: string, bytes?: number): Buffer | null {
  if (!BASE64_PATTERN.test(value)) return null;
  const decoded = Buffer.from(value, 'base64');
  if (bytes !== undefined && decoded.length !== bytes) return null;
  return decoded.length > 0 ? decoded : null;
}

export function encryptKey(plainKey: string): EncryptedKey {
  if (typeof plainKey !== 'string' || plainKey.length === 0) {
    throw new SourceError('invalidInput');
  }
  const { version, key } = currentMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  return {
    encryptedKey: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: version,
  };
}

export function decryptKey(row: EncryptedKey): string {
  if (!Number.isSafeInteger(row.keyVersion) || row.keyVersion < 1) {
    throw new SourceError('configurationMissing');
  }
  const key = masterKeyForVersion(row.keyVersion);
  const iv = decodeField(row.iv, IV_BYTES);
  const authTag = decodeField(row.authTag, TAG_BYTES);
  const encrypted = decodeField(row.encryptedKey);
  if (!iv || !authTag || !encrypted) throw new SourceError('byokKeyRejected');

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    // A tampered row, wrong key or wrong tag must never surface driver detail.
    throw new SourceError('byokKeyRejected');
  }
}
