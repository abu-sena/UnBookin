/**
 * Pure, explicit-zone date formatting for the journal. Never depends on the
 * server or browser system timezone, so SSR (UTC) and the client (any zone)
 * always render the same text. Kept free of `server-only` imports so client
 * components can use it.
 */
export const DEFAULT_JOURNAL_TIME_ZONE = 'Asia/Jakarta';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('id-ID', {
      timeZone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    // Invalid zone (server resolves it first; this only guards direct callers).
    return formatterFor(DEFAULT_JOURNAL_TIME_ZONE);
  }
  formatters.set(timeZone, formatter);
  return formatter;
}

export function formatJournalDate(
  iso: string,
  timeZone: string = DEFAULT_JOURNAL_TIME_ZONE,
): string {
  return formatterFor(timeZone).format(new Date(iso));
}
