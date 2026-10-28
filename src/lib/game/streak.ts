/** E8-04: deterministic streak calculation from the XP event ledger. */

import { localDate } from '../learning/leitner';

export const MAX_STREAK_FREEZES = 2;
/** MySQL-free upper bound; ~100 years of daily history is still cheap to walk. */
export const MAX_STREAK_RANGE_DAYS = 36_525;

export type CalculateStreakInput = {
  activeDates: readonly string[];
  today: string;
  joinedDate: string;
};

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;
  lastActiveDate: string | null;
  activeToday: boolean;
};

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type DateKey = { year: number; month: number; day: number };

function parseDateKey(value: string): DateKey {
  if (typeof value !== 'string') throw new Error('invalidDate');
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) throw new Error('invalidDate');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error('invalidDate');
  }
  return { year, month, day };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateKey({ year, month, day }: DateKey): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function utcDayNumber({ year, month, day }: DateKey): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** 0 = Sunday, 1 = Monday ... 6 = Saturday, independent of the host time zone. */
function weekday(dayNumber: number): number {
  return (((dayNumber + 4) % 7) + 7) % 7;
}

function dayNumberToKey(dayNumber: number): string {
  const date = new Date(dayNumber * 86_400_000);
  return formatDateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

/** `YYYY-MM-DD` for an instant in the user's local time zone. */
export function localDateKey(now: Date, timeZone: string): string {
  return localDate(now, timeZone);
}

/** Monday (`YYYY-MM-DD`) of the local week containing `now`. */
export function localWeekStart(now: Date, timeZone: string): string {
  const key = parseDateKey(localDate(now, timeZone));
  const offset = (weekday(utcDayNumber(key)) + 6) % 7;
  return dayNumberToKey(utcDayNumber(key) - offset);
}

/**
 * Walk the local calendar from `joinedDate` to `today`. Freezes are granted on
 * each Monday (capped at two) before that day is processed, an elapsed inactive
 * day consumes one freeze while a streak is alive, and today is never counted
 * as elapsed so an inactive today keeps yesterday's streak.
 */
export function calculateStreak({
  activeDates,
  today,
  joinedDate,
}: CalculateStreakInput): StreakState {
  const todayKey = parseDateKey(today);
  const joinedKey = parseDateKey(joinedDate);
  const todayDay = utcDayNumber(todayKey);
  const joinedDay = utcDayNumber(joinedKey);
  if (joinedDay > todayDay) throw new Error('invalidDateRange');
  if (todayDay - joinedDay > MAX_STREAK_RANGE_DAYS) throw new Error('invalidDateRange');

  const active = new Set<number>();
  for (const value of activeDates) {
    const key = parseDateKey(value);
    const day = utcDayNumber(key);
    if (day < joinedDay || day > todayDay) continue;
    active.add(day);
  }

  let currentStreak = 0;
  let longestStreak = 0;
  let streakFreezes = 0;
  let lastActiveDate: string | null = null;

  for (let day = joinedDay; day <= todayDay; day += 1) {
    if (weekday(day) === 1) {
      streakFreezes = Math.min(MAX_STREAK_FREEZES, streakFreezes + 1);
    }

    if (active.has(day)) {
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      longestStreak = Math.max(longestStreak, currentStreak);
      lastActiveDate = dayNumberToKey(day);
      continue;
    }

    if (day === todayDay) continue;
    if (currentStreak === 0) continue;

    if (streakFreezes > 0) {
      streakFreezes -= 1;
    } else {
      currentStreak = 0;
    }
  }

  return {
    currentStreak,
    longestStreak,
    streakFreezes,
    lastActiveDate,
    activeToday: active.has(todayDay),
  };
}
