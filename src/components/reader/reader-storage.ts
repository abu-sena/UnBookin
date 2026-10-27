export const READER_TABS = ['understand', 'apply', 'prove'] as const;

export type ReaderTab = (typeof READER_TABS)[number];

export type ReaderPosition = { tab: ReaderTab; scrollY: number };

const POSITION_KEY_PREFIX = 'ub_reader_position_';

export function isReaderTab(value: unknown): value is ReaderTab {
  return typeof value === 'string' && (READER_TABS as readonly string[]).includes(value);
}

/** Last tab and vertical position of one module; storage may throw in private mode. */
export function readReaderPosition(moduleId: string): ReaderPosition | null {
  try {
    const raw = window.localStorage.getItem(`${POSITION_KEY_PREFIX}${moduleId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (!isReaderTab(candidate.tab)) return null;
    if (
      typeof candidate.scrollY !== 'number' ||
      !Number.isFinite(candidate.scrollY) ||
      candidate.scrollY < 0
    ) {
      return null;
    }
    return { tab: candidate.tab, scrollY: candidate.scrollY };
  } catch {
    return null;
  }
}

/** Persists the reading position per device; a failing storage is ignored. */
export function saveReaderPosition(moduleId: string, position: ReaderPosition) {
  try {
    window.localStorage.setItem(`${POSITION_KEY_PREFIX}${moduleId}`, JSON.stringify(position));
  } catch {
    /* The page keeps working without storage. */
  }
}
