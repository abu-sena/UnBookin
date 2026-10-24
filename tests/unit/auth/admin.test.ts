import { describe, expect, it } from 'vitest';
import { isAdminEmail, parseAdminEmails } from '@/lib/auth/admin';

describe('admin email allowlist', () => {
  it('trims, lowercases, deduplicates, and ignores blank entries', () => {
    expect(parseAdminEmails(' Admin@Example.com , ,other@example.com,ADMIN@example.com ')).toEqual([
      'admin@example.com',
      'other@example.com',
    ]);
  });
  it('handles missing and empty configuration', () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails(' , ')).toEqual([]);
  });
  it('matches whole normalized emails only', () => {
    expect(isAdminEmail(' ADMIN@example.com ', 'admin@EXAMPLE.com')).toBe(true);
    expect(isAdminEmail('min@example.com', 'admin@example.com')).toBe(false);
    expect(isAdminEmail(null, 'admin@example.com')).toBe(false);
    expect(isAdminEmail('', '')).toBe(false);
  });
});
