import { describe, expect, it } from 'vitest';
import {
  REVIEW_INTERVAL_DAYS,
  firstDueAt,
  localDate,
  scheduleCard,
  startOfLocalDay,
} from '@/lib/learning/leitner';

const UTC = 'UTC';
const JAKARTA = 'Asia/Jakarta';
const LORD_HOWE = 'Australia/Lord_Howe';
const NOW = new Date('2026-10-27T10:30:00Z');

function expectLocalMidnight(dueAt: Date, zone: string, dayOffsetFromNow: number) {
  const expected = startOfLocalDay(NOW, zone, dayOffsetFromNow);
  expect(dueAt.toISOString()).toBe(expected.toISOString());
  // It is midnight in the zone: the formatted hour must be 00.
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(dueAt);
  expect(hour).toBe('00');
}

describe('REVIEW_INTERVAL_DAYS', () => {
  it('matches PRD E6-01 AC3 (1/3/7/14/30/60)', () => {
    expect([...REVIEW_INTERVAL_DAYS]).toEqual([1, 3, 7, 14, 30, 60]);
  });
});

describe('scheduleCard', () => {
  it('good promotes one box (max 5) with the next interval', () => {
    for (const [box, expectedBox] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 5],
    ] as const) {
      const next = scheduleCard({ box, result: 'good', now: NOW, timeZone: UTC });
      expect(next.box).toBe(expectedBox);
      expectLocalMidnight(next.dueAt, UTC, REVIEW_INTERVAL_DAYS[expectedBox]!);
    }
  });

  it('hard stays in the same box with half the interval (min 1 day)', () => {
    const cases: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 4],
      [3, 7],
      [4, 15],
      [5, 30],
    ];
    for (const [box, expectedDays] of cases) {
      const next = scheduleCard({ box, result: 'hard', now: NOW, timeZone: UTC });
      expect(next.box).toBe(box);
      expect(next.dueAt.getTime()).toBe(
        startOfLocalDay(NOW, UTC, expectedDays).getTime(),
      );
    }
  });

  it('again resets to box 0 due tomorrow', () => {
    for (const box of [0, 2, 5]) {
      const next = scheduleCard({ box, result: 'again', now: NOW, timeZone: UTC });
      expect(next.box).toBe(0);
      expectLocalMidnight(next.dueAt, UTC, 1);
    }
  });

  it('due dates are the START of the target LOCAL day (Jakarta)', () => {
    const next = scheduleCard({ box: 0, result: 'good', now: NOW, timeZone: JAKARTA });
    expect(next.box).toBe(1);
    expectLocalMidnight(next.dueAt, JAKARTA, REVIEW_INTERVAL_DAYS[1]!);
  });

  it('handles the Lord Howe DST boundary (+10:30 to +11:00 on 2026-10-04)', () => {
    // Local Oct 4 06:30 (= Oct 3 20:00 UTC, after the DST jump to +11:00).
    const now = new Date('2026-10-03T20:00:00Z');
    const next = scheduleCard({ box: 0, result: 'good', now, timeZone: LORD_HOWE });
    expect(next.box).toBe(1);
    // Local Oct 4 + 3 days (box 1 interval) = Oct 7 00:00 (+11:00) = Oct 6 13:00 UTC.
    expect(next.dueAt.toISOString()).toBe('2026-10-06T13:00:00.000Z');
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: LORD_HOWE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(next.dueAt);
    expect(local).toBe('10/07/2026');
  });

  it('rejects an out-of-range box', () => {
    for (const box of [-1, 6, 1.5]) {
      expect(() =>
        scheduleCard({ box, result: 'good', now: NOW, timeZone: UTC }),
      ).toThrow();
    }
  });
});

describe('firstDueAt', () => {
  it('is local midnight tomorrow (E6-01 AC1)', () => {
    const due = firstDueAt(NOW, UTC);
    expectLocalMidnight(due, UTC, 1);
    const jakarta = firstDueAt(NOW, JAKARTA);
    expectLocalMidnight(jakarta, JAKARTA, 1);
  });

  it('is safe across a DST jump (Sydney fall-back)', () => {
    // Sydney DST ends 2026-04-05 03:00 -> 02:00; evening of Apr 4 local.
    const now = new Date('2026-04-04T07:00:00Z'); // Apr 4 17:00 local (+10)
    const due = firstDueAt(now, 'Australia/Sydney');
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(due);
    expect(local).toBe('04/05/2026, 00:00');
  });
});

describe('localDate', () => {
  it('formats YYYY-MM-DD in the local zone', () => {
    expect(localDate(NOW, UTC)).toBe('2026-10-27');
    expect(localDate(NOW, JAKARTA)).toBe('2026-10-27');
    // 2026-10-27 23:30 UTC is already Oct 28 in Jakarta (+7).
    const late = new Date('2026-10-27T23:30:00Z');
    expect(localDate(late, UTC)).toBe('2026-10-27');
    expect(localDate(late, JAKARTA)).toBe('2026-10-28');
  });

  it('rejects an invalid date', () => {
    expect(() => localDate(new Date('nope'), UTC)).toThrow();
  });
});
