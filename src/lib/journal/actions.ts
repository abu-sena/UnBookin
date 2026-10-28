'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { toJournalErrorCode, type JournalResult } from './errors';
import { submitActionReportInputSchema, updateActionStatusInputSchema } from './schemas';
import { submitActionReport, updateActionStatus as updateActionStatusStore } from './store';
import type { JournalActionResult, SubmitActionReportResult } from './types';

/**
 * Server Actions for the M6 journal (E7). Authentication happens BEFORE any
 * parsing or try/catch via `requireUser('/journal')`, so the redirect
 * exception propagates. The identity is always built from the session; no
 * `userId`, model, score or `passed` value is ever accepted from the client.
 */

function run<T>(operation: () => Promise<T>): Promise<JournalResult<T>> {
  return operation().then(
    (data): JournalResult<T> => ({ ok: true, ...data }),
    (error: unknown): JournalResult<T> => ({ ok: false, code: toJournalErrorCode(error) }),
  );
}

function revalidateJournal(): void {
  revalidatePath('/journal');
  revalidatePath('/home');
  revalidatePath('/progress');
  revalidatePath('/profile');
}

/** E7-02: submit or revise one application report (AI feedback + XP). */
export async function reportAction(
  input: unknown,
): Promise<JournalResult<SubmitActionReportResult>> {
  const user = await requireUser('/journal');
  const parsed = submitActionReportInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };

  const result = await run(() => submitActionReport({ userId: user.id }, parsed.data));
  if (result.ok) revalidateJournal();
  return result;
}

/** E7-01: extend a planned action by 7 days or skip it (no penalty, no XP). */
export async function updateActionStatus(
  input: unknown,
): Promise<JournalResult<JournalActionResult>> {
  const user = await requireUser('/journal');
  const parsed = updateActionStatusInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };

  const result = await run(() => updateActionStatusStore({ userId: user.id }, parsed.data));
  if (result.ok) revalidateJournal();
  return result;
}
