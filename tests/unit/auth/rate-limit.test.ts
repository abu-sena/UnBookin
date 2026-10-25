import { describe, expect, it } from 'vitest';
import {
  EMAIL_VERIFICATION_MAX_AGE_SECONDS,
  isMagicLinkRateLimited,
  magicLinkCutoff,
} from '@/lib/auth/rate-limit';

describe('magic-link rate limit', () => {
  it('allows four tokens in the last hour', () => {
    expect(isMagicLinkRateLimited(4)).toBe(false);
  });

  it('blocks the fifth existing token (5 per hour)', () => {
    expect(isMagicLinkRateLimited(5)).toBe(true);
  });

  it('counts rows created in the last hour, not the full 24-hour token lifetime', () => {
    const now = new Date('2026-10-25T12:00:00.000Z');
    // expires = created_at + 24h, so "created in the last hour" means expires > now + 23h.
    expect(magicLinkCutoff(EMAIL_VERIFICATION_MAX_AGE_SECONDS, now)).toEqual(
      new Date('2026-10-26T11:00:00.000Z'),
    );
  });
});
