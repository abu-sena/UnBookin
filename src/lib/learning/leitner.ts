import type { ReviewResult } from './schemas';

/** E6-01 AC3: the box intervals in days. */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60] as const;
export const MIN_BOX = 0;
export const MAX_BOX = REVIEW_INTERVAL_DAYS.length - 1;

export type ScheduleCardInput = {
  box: number;
  result: ReviewResult;
  now: Date;
  timeZone: string;
};

export type ScheduledCard = { box: number; dueAt: Date };

type LocalDateParts = { year: number; month: number; day: number };

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function localDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    if (value === undefined) throw new Error('invalidDate');
    return Number(value);
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/**
 * Offset of the zone at that instant. Formatting the instant into local wall
 * clock parts and rebuilding it as UTC gives the offset without relying on the
 * host time zone. Works across DST transitions.
 */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = localDateTimeParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const withoutMs = date.getTime() - date.getMilliseconds();
  return asUtc - withoutMs;
}

function localMidnightUtc(parts: LocalDateParts, timeZone: string): Date {
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  let instant = wallClock - timeZoneOffsetMs(new Date(wallClock), timeZone);
  // Re-evaluate once at the resolved instant so a DST change between the day
  // boundary and the initial guess cannot shift the result to another day.
  instant = wallClock - timeZoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

function addLocalDays(parts: LocalDateParts, days: number): LocalDateParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function assertValidDate(now: Date): void {
  if (Number.isNaN(now.getTime())) throw new Error('invalidDate');
}

/** `YYYY-MM-DD` in the user's local time zone. */
export function localDate(now: Date, timeZone: string): string {
  assertValidDate(now);
  const parts = localDateTimeParts(now, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/**
 * UTC instant of local midnight `dayOffset` days after `now`'s local day.
 * `dayOffset = 0` is the start of today; `1` is the start of tomorrow.
 */
export function startOfLocalDay(now: Date, timeZone: string, dayOffset = 0): Date {
  assertValidDate(now);
  if (!Number.isInteger(dayOffset)) throw new Error('invalidDayOffset');
  const parts = localDateTimeParts(now, timeZone);
  return localMidnightUtc(addLocalDays(parts, dayOffset), timeZone);
}

/** E6-01 AC1: cards from a newly read module are due at local midnight tomorrow. */
export function firstDueAt(now: Date, timeZone: string): Date {
  return startOfLocalDay(now, timeZone, 1);
}

/** E6-01 AC3: `good` promotes a box, `hard` keeps it with half the interval, `again` resets. */
export function scheduleCard({ box, result, now, timeZone }: ScheduleCardInput): ScheduledCard {
  assertValidDate(now);
  if (!Number.isInteger(box) || box < MIN_BOX || box > MAX_BOX) {
    throw new Error('invalidBox');
  }

  let nextBox: number;
  let days: number;
  switch (result) {
    case 'good':
      nextBox = Math.min(MAX_BOX, box + 1);
      days = REVIEW_INTERVAL_DAYS[nextBox]!;
      break;
    case 'hard':
      nextBox = box;
      days = Math.max(1, Math.ceil(REVIEW_INTERVAL_DAYS[box]! / 2));
      break;
    case 'again':
      nextBox = MIN_BOX;
      days = 1;
      break;
  }

  return { box: nextBox, dueAt: startOfLocalDay(now, timeZone, days) };
}
