'use server';

import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { SourceError, toSourceErrorCode, type SourceErrorCode } from '@/lib/sources/errors';
import {
  deleteKey,
  getKeyStatus,
  loadPlainKey,
  markVerified,
  saveKey,
  type ByokKeyStatus,
} from './store';
import { looksLikeOpenRouterKey, testKey, type KeyTestResult } from './verify';

/**
 * Server Actions for E12. `requireUser` always runs first (outside any
 * try/catch) and identity comes from the session only. Results never carry a
 * key, ciphertext, IV, tag or vendor detail — only `last4` and safe codes.
 */

const manualKeySchema = z.strictObject({
  key: z.string().trim().min(20).max(512).refine(looksLikeOpenRouterKey),
});

export type ByokActionFailure = { ok: false; error: SourceErrorCode };
export type ConnectManualKeyResult =
  | { ok: true; data: { last4: string; status: Exclude<KeyTestResult, 'invalid'> } }
  | ByokActionFailure;
export type RetestByokResult =
  { ok: true; data: { status: Exclude<KeyTestResult, 'invalid'> } } | ByokActionFailure;
export type DisconnectByokResult = { ok: true } | ByokActionFailure;
export type GetByokStatusResult = { ok: true; data: ByokKeyStatus } | ByokActionFailure;

function failure(error: unknown): ByokActionFailure {
  return { ok: false, error: toSourceErrorCode(error) };
}

export async function connectManualKey(input: unknown): Promise<ConnectManualKeyResult> {
  const user = await requireUser('/settings/model-ai');
  const parsed = manualKeySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalidInput' };

  try {
    const result = await testKey(parsed.data.key);
    if (result === 'invalid') throw new SourceError('byokKeyRejected');
    const identity = { userId: user.id };
    const { last4 } = await saveKey(identity, parsed.data.key, 'manual');
    if (result === 'ok') await markVerified(identity);
    return { ok: true, data: { last4, status: result } };
  } catch (error) {
    return failure(error);
  }
}

export async function disconnectByok(): Promise<DisconnectByokResult> {
  const user = await requireUser('/settings/model-ai');
  try {
    await deleteKey({ userId: user.id });
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function retestByok(): Promise<RetestByokResult> {
  const user = await requireUser('/settings/model-ai');
  try {
    const plainKey = await loadPlainKey(user.id);
    if (!plainKey) throw new SourceError('byokKeyMissing');
    const result = await testKey(plainKey);
    if (result === 'invalid') throw new SourceError('byokKeyRejected');
    if (result === 'ok') await markVerified({ userId: user.id });
    return { ok: true, data: { status: result } };
  } catch (error) {
    return failure(error);
  }
}

export async function getByokStatus(): Promise<GetByokStatusResult> {
  const user = await requireUser('/settings/model-ai');
  try {
    return { ok: true, data: await getKeyStatus({ userId: user.id }) };
  } catch (error) {
    return failure(error);
  }
}
