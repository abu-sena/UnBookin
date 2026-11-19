export const MENTOR_ERROR_CODES = [
  'invalidInput',
  'notFound',
  'quotaExceeded',
  'rateLimited',
  'sourceUnavailable',
  'byokKeyMissing',
  'byokKeyRejected',
  'failed',
] as const;
export type MentorErrorCode = (typeof MENTOR_ERROR_CODES)[number];

/** A safe, typed mentor error; the message is always a code. */
export class MentorError extends Error {
  readonly code: MentorErrorCode;

  constructor(code: MentorErrorCode) {
    super(code);
    this.name = 'MentorError';
    this.code = code;
  }
}

/** Success spreads its payload, like the other stores; failures only expose a code. */
export type MentorResult<T> = ({ ok: true } & T) | { ok: false; code: MentorErrorCode };

export function toMentorErrorCode(error: unknown): MentorErrorCode {
  return error instanceof MentorError ? error.code : 'failed';
}
