import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/**
 * OAuth PKCE helpers (RFC 7636, S256). The verifier is 43–128 characters from
 * the unreserved set; its challenge is the base64url SHA-256 digest without
 * padding. State is an independent high-entropy value.
 */

const VERIFIER_BYTES = 48;
const STATE_BYTES = 32;
const UNRESERVED = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isCodeVerifier(value: unknown): value is string {
  return typeof value === 'string' && UNRESERVED.test(value);
}

export function createCodeVerifier(): string {
  for (;;) {
    const verifier = randomBytes(VERIFIER_BYTES).toString('base64url');
    if (isCodeVerifier(verifier)) return verifier;
  }
}

export function codeChallengeS256(verifier: string): string {
  if (!isCodeVerifier(verifier)) throw new Error('invalid-code-verifier');
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function createState(): string {
  return randomBytes(STATE_BYTES).toString('base64url');
}
