/** E8-06: weekly mission scheduling helpers (pure, no DB). */

/**
 * True when the instant falls on Monday 00:00-00:59 in the user's local zone.
 * The hourly cron uses this to reconcile a user exactly at their local Monday
 * midnight, independent of the server time zone.
 */
export function isMondayMidnightLocal(now: Date, timeZone: string): boolean {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalidDate');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = parts.find((part) => part.type === 'hour')?.value;
  return weekday === 'Mon' && hour === '00';
}
