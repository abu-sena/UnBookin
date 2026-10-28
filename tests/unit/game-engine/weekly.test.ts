import { describe, expect, it } from 'vitest';
import { isMondayMidnightLocal } from '@/lib/game/weekly';

describe('isMondayMidnightLocal', () => {
  it('is true only in the Monday 00:xx local hour', () => {
    // Sun 2026-10-25 17:00Z = Mon 2026-10-26 00:00 in Jakarta (UTC+7).
    expect(isMondayMidnightLocal(new Date('2026-10-25T17:00:00Z'), 'Asia/Jakarta')).toBe(true);
    expect(isMondayMidnightLocal(new Date('2026-10-25T17:59:59Z'), 'Asia/Jakarta')).toBe(true);
    expect(isMondayMidnightLocal(new Date('2026-10-25T18:00:00Z'), 'Asia/Jakarta')).toBe(false);
    expect(isMondayMidnightLocal(new Date('2026-10-25T16:59:59Z'), 'Asia/Jakarta')).toBe(false);
  });

  it('selects a different instant per zone for the same Monday', () => {
    const instant = new Date('2026-10-26T00:30:00Z');
    expect(isMondayMidnightLocal(instant, 'UTC')).toBe(true);
    expect(isMondayMidnightLocal(instant, 'Asia/Jakarta')).toBe(false);
    // Monday 00:xx in Los Angeles (UTC-7 in October) is 07:xx UTC.
    expect(isMondayMidnightLocal(new Date('2026-10-26T07:15:00Z'), 'America/Los_Angeles')).toBe(
      true,
    );
  });

  it('is false on other weekdays at midnight and rejects invalid dates', () => {
    expect(isMondayMidnightLocal(new Date('2026-10-27T00:10:00Z'), 'UTC')).toBe(false);
    expect(() => isMondayMidnightLocal(new Date('nope'), 'UTC')).toThrow('invalidDate');
  });
});
