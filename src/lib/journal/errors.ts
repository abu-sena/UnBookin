export const JOURNAL_ERROR_CODES = [
  'invalidInput',
  'notFound',
  'alreadyCompleted',
  'revisionLimit',
  'conflict',
  'gradingUnavailable',
  'unexpected',
] as const;
export type JournalErrorCode = (typeof JOURNAL_ERROR_CODES)[number];

/** A safe, typed journal error; the message is always a code. */
export class JournalError extends Error {
  readonly code: JournalErrorCode;

  constructor(code: JournalErrorCode) {
    super(code);
    this.name = 'JournalError';
    this.code = code;
  }
}

/** Success spreads its payload; failures only expose a safe code. */
export type JournalResult<T> = ({ ok: true } & T) | { ok: false; code: JournalErrorCode };

export function toJournalErrorCode(error: unknown): JournalErrorCode {
  return error instanceof JournalError ? error.code : 'unexpected';
}
