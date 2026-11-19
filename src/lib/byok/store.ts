import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { byokKeys } from '@/db/schema';
import { decryptKey, encryptKey } from '@/lib/crypto/byok';
import { SourceError } from '@/lib/sources/errors';

/**
 * The one BYOK row per user (PRD §6, E12). Identity always comes from the
 * server session, never from the client. Ciphertext and plain keys stay on the
 * server: only `getKeyStatus` is safe to hand to a client-facing action.
 */

export type ByokIdentity = { userId: string };
export type ByokVia = 'oauth' | 'manual';

export type ByokKeyStatus = {
  connected: boolean;
  last4: string | null;
  via: ByokVia | null;
  verifiedAt: Date | null;
};

function assertIdentity(identity: ByokIdentity): string {
  if (!z.uuid().safeParse(identity.userId).success) throw new SourceError('invalidInput');
  return identity.userId;
}

function assertPlainKey(plainKey: string): string {
  if (typeof plainKey !== 'string' || plainKey.trim().length === 0) {
    throw new SourceError('invalidInput');
  }
  return plainKey.trim();
}

/** Insert or replace the user's key and clear any previous revocation. */
export async function saveKey(
  identity: ByokIdentity,
  plainKey: string,
  via: ByokVia,
): Promise<{ last4: string }> {
  const userId = assertIdentity(identity);
  const key = assertPlainKey(plainKey);
  const encrypted = encryptKey(key);
  const last4 = key.slice(-4);

  await db
    .insert(byokKeys)
    .values({
      userId,
      encryptedKey: encrypted.encryptedKey,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      last4,
      connectedVia: via,
      verifiedAt: null,
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: byokKeys.userId,
      set: {
        encryptedKey: encrypted.encryptedKey,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        last4,
        connectedVia: via,
        verifiedAt: null,
        revokedAt: null,
        updatedAt: new Date(),
      },
    });

  return { last4 };
}

/** Client-safe status only: never ciphertext, IV, tag or the plain key. */
export async function getKeyStatus(identity: ByokIdentity): Promise<ByokKeyStatus> {
  const userId = assertIdentity(identity);
  const [row] = await db
    .select({
      last4: byokKeys.last4,
      connectedVia: byokKeys.connectedVia,
      verifiedAt: byokKeys.verifiedAt,
      revokedAt: byokKeys.revokedAt,
    })
    .from(byokKeys)
    .where(eq(byokKeys.userId, userId))
    .limit(1);

  if (!row || row.revokedAt) {
    return { connected: false, last4: null, via: null, verifiedAt: null };
  }
  return {
    connected: true,
    last4: row.last4,
    via: row.connectedVia,
    verifiedAt: row.verifiedAt,
  };
}

/** AC7: disconnect removes the row entirely, not just a flag. */
export async function deleteKey(identity: ByokIdentity): Promise<void> {
  const userId = assertIdentity(identity);
  await db.delete(byokKeys).where(eq(byokKeys.userId, userId));
}

/** Server use only (AI router). Returns null when the user has no usable key. */
export async function loadPlainKey(userId: string): Promise<string | null> {
  if (!z.uuid().safeParse(userId).success) return null;
  const [row] = await db
    .select({
      encryptedKey: byokKeys.encryptedKey,
      iv: byokKeys.iv,
      authTag: byokKeys.authTag,
      keyVersion: byokKeys.keyVersion,
      revokedAt: byokKeys.revokedAt,
    })
    .from(byokKeys)
    .where(eq(byokKeys.userId, userId))
    .limit(1);

  if (!row || row.revokedAt) return null;
  return decryptKey({
    encryptedKey: row.encryptedKey,
    iv: row.iv,
    authTag: row.authTag,
    keyVersion: row.keyVersion,
  });
}

export async function markVerified(identity: ByokIdentity, at: Date = new Date()): Promise<void> {
  const userId = assertIdentity(identity);
  await db.update(byokKeys).set({ verifiedAt: at }).where(eq(byokKeys.userId, userId));
}
