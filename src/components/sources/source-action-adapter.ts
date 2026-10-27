import {
  cancelSourceUpload,
  completeSourceUpload,
  createTextSource,
  createUrlSource,
  getSourceUploadContext,
  prepareSourceUpload,
} from '@/lib/sources/actions';
import type {
  SourceFileUploadInput,
  SourceIdInput,
  SourceTextInput,
  SourceUrlInput,
} from '@/lib/sources/schema';
import type {
  CancelledSourceResult,
  CreatedSourceResult,
  PrepareSourceUploadResult,
  SourceActionResult,
  SourceErrorCode,
  SourceUploadContext,
} from '@/lib/sources/types';
import { putSourceFile } from './upload-transport';

export type SourceUploadContextState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: SourceUploadContext }
  | { status: 'error'; error: SourceErrorCode };

export type SourceFileTransfer = {
  url: string;
  file: File;
  mimeType: string;
  onProgress: (percent: number) => void;
  signal: AbortSignal;
};

export type SourceUploadAdapter = {
  getContext: () => Promise<SourceActionResult<SourceUploadContext>>;
  prepareFileUpload: (
    input: SourceFileUploadInput,
  ) => Promise<SourceActionResult<PrepareSourceUploadResult>>;
  uploadFile: (transfer: SourceFileTransfer) => Promise<void>;
  completeFileUpload: (input: SourceIdInput) => Promise<SourceActionResult<CreatedSourceResult>>;
  cancelFileUpload: (input: SourceIdInput) => Promise<SourceActionResult<CancelledSourceResult>>;
  createTextSource: (input: SourceTextInput) => Promise<SourceActionResult<CreatedSourceResult>>;
  createUrlSource: (input: SourceUrlInput) => Promise<SourceActionResult<CreatedSourceResult>>;
};

export const sourceActionAdapter: SourceUploadAdapter = {
  getContext: () => getSourceUploadContext(),
  prepareFileUpload: (input) => prepareSourceUpload(input),
  uploadFile: (transfer) => putSourceFile(transfer),
  completeFileUpload: (input) => completeSourceUpload(input),
  cancelFileUpload: (input) => cancelSourceUpload(input),
  createTextSource: (input) => createTextSource(input),
  createUrlSource: (input) => createUrlSource(input),
};
