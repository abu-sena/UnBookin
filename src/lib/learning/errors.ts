export const LEARNING_ERROR_CODES = [
  'invalidInput',
  'notFound',
  'notReady',
  'failed',
  'gradingUnavailable',
] as const;
export type LearningErrorCode = (typeof LEARNING_ERROR_CODES)[number];

/** A safe, typed learning error; the message is always a code. */
export class LearningError extends Error {
  readonly code: LearningErrorCode;

  constructor(code: LearningErrorCode) {
    super(code);
    this.name = 'LearningError';
    this.code = code;
  }
}

/** Success spreads its payload, like the sources actions; failures only expose a code. */
export type LearningResult<T> = ({ ok: true } & T) | { ok: false; code: LearningErrorCode };

export function toLearningErrorCode(error: unknown): LearningErrorCode {
  return error instanceof LearningError ? error.code : 'failed';
}
