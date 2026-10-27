/**
 * Client-safe source error codes. These are the only error values allowed to
 * cross a Server Action / Route Handler boundary; vendor messages, source text,
 * API keys and storage keys never do.
 */
export const SOURCE_ERROR_CODES = [
  'invalidInput',
  'rightsRequired',
  'fileType',
  'fileTooLarge',
  'pagesExceeded',
  'quotaExceeded',
  'storageUnavailable',
  'jobsUnavailable',
  'embeddingUnavailable',
  'generationUnavailable',
  'generationInvalid',
  'invalidUrl',
  'fetchFailed',
  'noText',
  'notFound',
  'processingFailed',
  'configurationMissing',
] as const;

export type SourceErrorCode = (typeof SOURCE_ERROR_CODES)[number];

/** A safe, typed source error. The message is always a code, never vendor detail. */
export class SourceError extends Error {
  readonly code: SourceErrorCode;

  constructor(code: SourceErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'SourceError';
    this.code = code;
  }
}

export type SourceActionResult<T> = { ok: true; data: T } | { ok: false; error: SourceErrorCode };

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  $metadata?: { httpStatusCode?: unknown };
};

function readErrorLike(error: unknown): ErrorLike | null {
  return typeof error === 'object' && error !== null ? (error as ErrorLike) : null;
}

/**
 * Map anything thrown by storage, jobs, extraction or embedding SDKs to a safe
 * code. Only well-known names/status codes are inspected; messages are never
 * returned or matched, so vendor text cannot leak through this function.
 */
export function toSourceErrorCode(error: unknown): SourceErrorCode {
  if (error instanceof SourceError) return error.code;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'fetchFailed';
  }
  if (error instanceof SyntaxError) return 'invalidInput';

  const like = readErrorLike(error);
  if (!like) return 'processingFailed';

  const name = typeof like.name === 'string' ? like.name : '';
  const status = like.$metadata?.httpStatusCode;

  if (name === 'NoSuchKey' || name === 'NotFound' || status === 404) return 'notFound';
  if (name === 'EntityTooLarge' || status === 413) return 'fileTooLarge';
  if (
    name === 'AccessDenied' ||
    name === 'InvalidAccessKeyId' ||
    name === 'SignatureDoesNotMatch' ||
    status === 401 ||
    status === 403
  ) {
    return 'storageUnavailable';
  }
  if (name === 'AbortError' || name === 'TimeoutError' || status === 408 || status === 429) {
    return 'fetchFailed';
  }
  if (typeof status === 'number' && status >= 500) return 'processingFailed';
  if (status !== undefined && typeof status !== 'number') return 'processingFailed';

  // Vendor errors can include their own message in `code`; only known codes are safe.
  if (like.code === 'ETIMEDOUT' || like.code === 'ECONNRESET') return 'fetchFailed';
  if (like.code === 'ENOENT') return 'notFound';

  return 'processingFailed';
}

/** Narrow an unknown failure into a `SourceError` without copying its message. */
export function toSourceError(error: unknown, fallback: SourceErrorCode = 'processingFailed') {
  if (error instanceof SourceError) return error;
  const code = toSourceErrorCode(error);
  return new SourceError(code === 'processingFailed' ? fallback : code);
}

export function isSourceErrorCode(value: unknown): value is SourceErrorCode {
  return typeof value === 'string' && (SOURCE_ERROR_CODES as readonly string[]).includes(value);
}
