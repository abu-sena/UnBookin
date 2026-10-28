import { describe, expect, it } from 'vitest';
import { calculateStreak, localDateKey, localWeekStart } from '@/lib/game/streak';

const range = (start: string, end: string): string[] => {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const cursor = new Date(Date.UTC(sy!, sm! - 1, sd!));
  const last = Date.UTC(ey!, em! - 1, ed!);
  const dates: string[] = [];
  while (cursor.getTime() <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

describe('calculateStreak', () => {
  it('counts consecutive active days and grants the first Monday freeze', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-10-26', '2026-10-27', '2026-10-28'],
        today: '2026-10-28',
        joinedDate: '2026-10-26',
      }),
    ).toEqual({
      currentStreak: 3,
      longestStreak: 3,
      streakFreezes: 1,
      lastActiveDate: '2026-10-28',
      activeToday: true,
    });
  });

  it('keeps yesterday streak when today is inactive (today is not elapsed)', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-10-26', '2026-10-27'],
        today: '2026-10-28',
        joinedDate: '2026-10-26',
      }),
    ).toEqual({
      currentStreak: 2,
      longestStreak: 2,
      streakFreezes: 1,
      lastActiveDate: '2026-10-27',
      activeToday: false,
    });
  });

  it('consumes a freeze for one elapsed inactive day and preserves the streak', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-10-26'],
        today: '2026-10-28',
        joinedDate: '2026-10-26',
      }),
    ).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      streakFreezes: 0,
      lastActiveDate: '2026-10-26',
      activeToday: false,
    });
  });

  it('resets current when a gap is longer than the available freezes', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-10-26'],
        today: '2026-10-30',
        joinedDate: '2026-10-26',
      }),
    ).toEqual({
      currentStreak: 0,
      longestStreak: 1,
      streakFreezes: 0,
      lastActiveDate: '2026-10-26',
      activeToday: false,
    });
  });

  it('bridges two elapsed days with two accumulated freezes', () => {
    const result = calculateStreak({
      activeDates: [...range('2026-10-12', '2026-10-25'), '2026-10-28'],
      today: '2026-10-28',
      joinedDate: '2026-10-12',
    });
    expect(result.currentStreak).toBe(15);
    expect(result.longestStreak).toBe(15);
    expect(result.streakFreezes).toBe(0);
    expect(result.activeToday).toBe(true);
  });

  it('resets after exhausting freezes mid-gap while preserving longest history', () => {
    const result = calculateStreak({
      activeDates: [...range('2026-10-12', '2026-10-25'), '2026-10-29'],
      today: '2026-10-29',
      joinedDate: '2026-10-12',
    });
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(14);
    expect(result.streakFreezes).toBe(0);
    expect(result.lastActiveDate).toBe('2026-10-29');
  });

  it('grants the Monday freeze before processing that day absence', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-10-25'],
        today: '2026-10-27',
        joinedDate: '2026-10-25',
      }),
    ).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      streakFreezes: 0,
      lastActiveDate: '2026-10-25',
      activeToday: false,
    });
  });

  it('replenishes on Monday and caps unused freezes at two', () => {
    expect(
      calculateStreak({
        activeDates: [],
        today: '2026-11-16',
        joinedDate: '2026-10-26',
      }),
    ).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      streakFreezes: 2,
      lastActiveDate: null,
      activeToday: false,
    });
  });

  it('handles leap days and duplicates without double counting', () => {
    expect(
      calculateStreak({
        activeDates: ['2024-02-28', '2024-02-29', '2024-02-29', '2024-03-01'],
        today: '2024-03-01',
        joinedDate: '2024-02-28',
      }),
    ).toEqual({
      currentStreak: 3,
      longestStreak: 3,
      streakFreezes: 0,
      lastActiveDate: '2024-03-01',
      activeToday: true,
    });
  });

  it('ignores future dates and dates before the join date', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-10-24', '2026-10-26', '2026-10-29'],
        today: '2026-10-28',
        joinedDate: '2026-10-26',
      }),
    ).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      streakFreezes: 0,
      lastActiveDate: '2026-10-26',
      activeToday: false,
    });
  });

  it('accepts unsorted active dates', () => {
    expect(
      calculateStreak({
        activeDates: ['2026-10-28', '2026-10-26', '2026-10-27'],
        today: '2026-10-28',
        joinedDate: '2026-10-26',
      }).currentStreak,
    ).toBe(3);
  });

  it('rejects invalid calendar dates and ranges', () => {
    expect(() =>
      calculateStreak({ activeDates: [], today: '2026-02-30', joinedDate: '2026-02-01' }),
    ).toThrow('invalidDate');
    expect(() =>
      calculateStreak({
        activeDates: ['2026-13-01'],
        today: '2026-12-01',
        joinedDate: '2026-01-01',
      }),
    ).toThrow('invalidDate');
    expect(() =>
      calculateStreak({ activeDates: [], today: '2026-10-01', joinedDate: '2026-10-02' }),
    ).toThrow('invalidDateRange');
    expect(() =>
      calculateStreak({ activeDates: [], today: '2100-01-01', joinedDate: '1990-01-01' }),
    ).toThrow('invalidDateRange');
  });
});

describe('local date helpers', () => {
  it('formats the local date key around a day boundary', () => {
    const instant = new Date('2026-10-27T20:30:00.000Z');
    expect(localDateKey(instant, 'America/New_York')).toBe('2026-10-27');
    expect(localDateKey(new Date('2026-10-28T00:30:00.000Z'), 'Asia/Jakarta')).toBe('2026-10-28');
    expect(localDateKey(new Date('2026-10-27T20:30:00.000Z'), 'Asia/Jakarta')).toBe('2026-10-28');
  });

  it('returns the Monday of the local week', () => {
    expect(localWeekStart(new Date('2026-10-28T12:00:00.000Z'), 'UTC')).toBe('2026-10-26');
    expect(localWeekStart(new Date('2026-10-26T00:00:00.000Z'), 'UTC')).toBe('2026-10-26');
    expect(localWeekStart(new Date('2026-11-01T23:00:00.000Z'), 'UTC')).toBe('2026-10-26');
    expect(localWeekStart(new Date('2026-11-02T00:00:00.000Z'), 'UTC')).toBe('2026-11-02');
    expect(localWeekStart(new Date('2026-10-28T20:30:00.000Z'), 'America/New_York')).toBe(
      '2026-10-26',
    );
  });
});
