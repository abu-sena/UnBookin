/**
 * Magic-link rate limit (PRD §11): at most 5 requests per email per hour.
 *
 * Auth.js stores one `verification_tokens` row per request with
 * `expires = created_at + maxAge` (24 hours for the Resend provider). A row was
 * therefore created in the last hour when `expires > now + (maxAge - 1 hour)`.
 */
export const MAGIC_LINK_MAX_PER_HOUR = 5;
export const EMAIL_VERIFICATION_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Lower bound passed to `verification_tokens.expires` when counting the last hour. */
export function magicLinkCutoff(maxAgeSeconds: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + (maxAgeSeconds - 60 * 60) * 1000);
}

/** Pure decision helper, tested independently from the database query. */
export function isMagicLinkRateLimited(recentTokenCount: number): boolean {
  return recentTokenCount >= MAGIC_LINK_MAX_PER_HOUR;
}
