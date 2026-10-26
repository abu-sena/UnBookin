'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { toSourceErrorCode, type SourceActionResult } from './errors';
import {
  sourceFileUploadSchema,
  sourceIdInputSchema,
  sourceTextInputSchema,
  sourceUrlInputSchema,
  unbookIdInputSchema,
  type SourceFileUploadInput,
  type SourceIdInput,
  type SourceTextInput,
  type SourceUrlInput,
  type UnbookIdInput,
} from './schema';
import type {
  CancelledSourceResult,
  CreatedSourceResult,
  DeletedUnbookResult,
  PrepareSourceUploadResult,
  SourceUploadContext,
} from './types';
import { createInlineSource, prepareFileSource } from './store';
import {
  cancelSourceUpload as cancelPendingSourceUpload,
  deleteOwnedUnbook,
  finalizeSourceUpload,
  retrySourceProcessing as retryFailedSourceProcessing,
} from './lifecycle';
import { loadMyUploadContext } from './queries';
import type { z } from 'zod';

/**
 * Server Actions for the E2-01 upload flows. Every mutation authenticates via
 * `requireUser('/library')` BEFORE entering any try/catch (redirects must
 * propagate), then re-validates the UNKNOWN client input with the shared Zod
 * schemas (strict, so forged `userId` keys are rejected). Only safe error
 * codes cross the boundary; the server identity is never accepted from or
 * exposed to the client.
 */

/** Rights failures get their own message (E2-01 AC2); everything else is generic. */
function parseErrorToCode(error: z.ZodError): 'invalidInput' | 'rightsRequired' {
  const touchesRights = error.issues.some((issue) => issue.path[0] === 'rightsConfirmed');
  return touchesRights ? 'rightsRequired' : 'invalidInput';
}

function safeResult<T>(run: () => Promise<T>): Promise<SourceActionResult<T>> {
  return run().then(
    (data): SourceActionResult<T> => ({ ok: true, data }),
    (error: unknown): SourceActionResult<T> => ({ ok: false, error: toSourceErrorCode(error) }),
  );
}

/** Prepare a pending PDF/EPUB upload and sign the direct-to-R2 URL. */
export async function prepareSourceUpload(
  input: SourceFileUploadInput,
): Promise<SourceActionResult<PrepareSourceUploadResult>> {
  const user = await requireUser('/library');
  const parsed = sourceFileUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parseErrorToCode(parsed.error) };

  return safeResult(async () => {
    const result = await prepareFileSource(user.id, parsed.data);
    revalidatePath('/library');
    return result;
  });
}

/** Verify the uploaded file, claim the transition and queue the ingest job. */
export async function completeSourceUpload(
  input: SourceIdInput,
): Promise<SourceActionResult<CreatedSourceResult>> {
  const user = await requireUser('/library');
  const parsed = sourceIdInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalidInput' };

  return safeResult(async () => {
    const result = await finalizeSourceUpload(user.id, parsed.data.sourceId);
    revalidatePath('/library');
    return result;
  });
}

/** Queue a pasted-text source; content is stored in its own R2 object. */
export async function createTextSource(
  input: SourceTextInput,
): Promise<SourceActionResult<CreatedSourceResult>> {
  const user = await requireUser('/library');
  const parsed = sourceTextInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parseErrorToCode(parsed.error) };

  return safeResult(async () => {
    const { unbookId } = await createInlineSource(user.id, {
      title: parsed.data.title,
      interestSlug: parsed.data.interestSlug,
      text: parsed.data.text,
    });
    revalidatePath('/library');
    return { unbookId };
  });
}

/** Queue a URL source; the public fetch runs in the background ingest. */
export async function createUrlSource(
  input: SourceUrlInput,
): Promise<SourceActionResult<CreatedSourceResult>> {
  const user = await requireUser('/library');
  const parsed = sourceUrlInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parseErrorToCode(parsed.error) };

  return safeResult(async () => {
    const { unbookId } = await createInlineSource(user.id, {
      title: parsed.data.title,
      interestSlug: parsed.data.interestSlug,
      url: parsed.data.url,
    });
    revalidatePath('/library');
    return { unbookId };
  });
}

/** Cancel a pending upload (before the file is submitted for processing). */
export async function cancelSourceUpload(
  input: SourceIdInput,
): Promise<SourceActionResult<CancelledSourceResult>> {
  const user = await requireUser('/library');
  const parsed = sourceIdInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalidInput' };

  return safeResult(async () => {
    await cancelPendingSourceUpload(user.id, parsed.data.sourceId);
    revalidatePath('/library');
    return { cancelled: true } as const;
  });
}

/** Retry a failed flow; quota is re-checked without resetting usage. */
export async function retrySourceProcessing(
  input: UnbookIdInput,
): Promise<SourceActionResult<CreatedSourceResult>> {
  const user = await requireUser('/library');
  const parsed = unbookIdInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalidInput' };

  return safeResult(async () => {
    await retryFailedSourceProcessing(user.id, parsed.data.unbookId);
    revalidatePath('/library');
    return { unbookId: parsed.data.unbookId };
  });
}

/** Delete an owned Unbook, its file, chunks and (unshared) source. */
export async function deleteMyUnbook(
  input: UnbookIdInput,
): Promise<SourceActionResult<DeletedUnbookResult>> {
  const user = await requireUser('/library');
  const parsed = unbookIdInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalidInput' };

  return safeResult(async () => {
    await deleteOwnedUnbook(user.id, parsed.data.unbookId);
    revalidatePath('/library');
    return { deleted: true } as const;
  });
}

/**
 * Safe wrapper around `getMyUploadContext`: the authentication (and its
 * redirect for signed-out users) happens OUTSIDE the catch, while quota or
 * configuration failures become a safe error result.
 */
export async function getSourceUploadContext(): Promise<SourceActionResult<SourceUploadContext>> {
  const user = await requireUser('/library');
  try {
    const context = await loadMyUploadContext(user.id);
    return { ok: true, data: context };
  } catch (error) {
    return { ok: false, error: toSourceErrorCode(error) };
  }
}
