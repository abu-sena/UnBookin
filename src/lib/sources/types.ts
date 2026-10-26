import type { SourceAllowance } from '@/lib/billing/source-quota';
import type { SourceErrorCode } from './errors';

export type { SourceActionResult, SourceErrorCode } from './errors';

/**
 * Controlled pipeline stage keys shown by the processing screen (E2-02 AC1).
 * Values stored in `unbooks.current_stage` are free text; anything that does
 * not parse into this union is re-derived from the row statuses instead.
 */
export const SOURCE_PROGRESS_STAGES = [
  'uploading',
  'reading',
  'chunking',
  'embedding',
  'ingested',
  'failed',
  'outlining',
  'generating',
  'ready',
] as const;

export type SourceProgressStage = (typeof SOURCE_PROGRESS_STAGES)[number];

/** Upload context for the E2-01 upload sheet: active interests plus capacity. */
export type SourceUploadContext = {
  interests: { slug: string; name: string }[];
  allowance: SourceAllowance;
};

export type PrepareSourceUploadResult = {
  sourceId: string;
  unbookId: string;
  uploadUrl: string;
  mimeType: string;
};

export type CreatedSourceResult = { unbookId: string };

export type CancelledSourceResult = { cancelled: true };
export type DeletedUnbookResult = { deleted: true };

/**
 * Safe processing progress for one owned Unbook. Never contains raw source
 * text, file keys, URLs or vendor errors.
 */
export type SourceProgress = {
  unbookId: string;
  title: string;
  sourceId: string | null;
  sourceStatus: 'uploaded' | 'extracting' | 'ready' | 'failed' | null;
  unbookStatus: 'queued' | 'outlining' | 'generating' | 'ready' | 'failed';
  stage: SourceProgressStage;
  progressPct: number;
  embeddedChunks: number;
  totalChunks: number;
  errorCode: SourceErrorCode | null;
};
