/**
 * Client-safe billing error codes. These are the only billing error values
 * allowed to cross a Server Action / Route Handler boundary; vendor messages,
 * payment payloads and server keys never do.
 */
export const BILLING_ERROR_CODES = [
  'invalidInput',
  'configurationMissing',
  'planUnavailable',
  'freePlanNotPurchasable',
  'orderLimitReached',
  'paymentNotFound',
  'midtransUnavailable',
  'midtransFailed',
  'midtransInvalidResponse',
  'quotaExceeded',
  'planRequired',
] as const;

export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

/** A safe, typed billing error. The message is always a code, never vendor detail. */
export class BillingError extends Error {
  readonly code: BillingErrorCode;

  constructor(code: BillingErrorCode) {
    super(code);
    this.name = 'BillingError';
    this.code = code;
  }
}

export function toBillingErrorCode(error: unknown): BillingErrorCode {
  return error instanceof BillingError ? error.code : 'invalidInput';
}

export function isBillingErrorCode(value: unknown): value is BillingErrorCode {
  return typeof value === 'string' && (BILLING_ERROR_CODES as readonly string[]).includes(value);
}
