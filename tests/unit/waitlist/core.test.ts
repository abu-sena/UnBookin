import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { computePosition } from '@/lib/waitlist/position';
import { computeSavingsPct } from '@/lib/billing/pricing';
import { generateReferralCode, REFERRAL_ALPHABET } from '@/lib/waitlist/referral';
import { waitlistSchema } from '@/lib/waitlist/schema';
import { planSeeds, priceVariantSeeds } from '@/db/seed-data';

describe('waitlist pure helpers', () => {
  it.each([
    [30, 0, 30],
    [30, 2, 10],
    [3, 1, 1],
    [1, 20, 1],
  ])('position %i with %i referrals is %i', (rank, referrals, expected) => {
    expect(computePosition(rank, referrals)).toBe(expected);
  });
  it('calculates variant A yearly savings from seeded prices', () => {
    const price = (code: string) => planSeeds.find((row) => row.code === code)!.priceIdr;
    expect(computeSavingsPct(price('pro_yearly'), price('pro_monthly'))).toBe(37);
    expect(computeSavingsPct(price('byok_yearly'), price('byok_monthly'))).toBe(28);
    expect(computeSavingsPct(0, 0)).toBeNull();
  });
  it('calculates B yearly savings using B monthly prices', () => {
    const price = (code: string) =>
      priceVariantSeeds.find((row) => row.planCode === code)!.priceIdr;
    expect(computeSavingsPct(price('pro_yearly'), price('pro_monthly'))).toBe(36);
    expect(computeSavingsPct(price('byok_yearly'), price('byok_monthly'))).toBe(34);
  });
  it('generates eight unambiguous cryptographically random characters', () => {
    expect(REFERRAL_ALPHABET).not.toMatch(/[0O1Il]/);
    const codes = Array.from({ length: 100 }, generateReferralCode);
    for (const code of codes) {
      expect(code).toHaveLength(8);
      expect([...code].every((char) => REFERRAL_ALPHABET.includes(char))).toBe(true);
    }
    expect(new Set(codes).size).toBe(100);
  });
  it('normalizes valid email and accepts optional referral and attribution', () => {
    expect(
      waitlistSchema.parse({
        email: '  NAME@Example.com ',
        interestSlug: 'islamic-studies',
        ref: 'ABcd2345',
        utm: 'utm_source=test',
      }).email,
    ).toBe('name@example.com');
  });
  it.each([
    { email: 'bad' },
    { email: `${'a'.repeat(250)}@example.com` },
    { interestSlug: 'general' },
    { interestSlug: '' },
    { ref: 'bad!' },
    { utm: 'a'.repeat(301) },
  ])('rejects invalid input %o', (override) => {
    expect(
      waitlistSchema.safeParse({
        email: 'valid@example.com',
        interestSlug: 'islamic-studies',
        ...override,
      }).success,
    ).toBe(false);
  });
});
