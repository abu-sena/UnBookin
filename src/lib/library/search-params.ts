import { z } from 'zod';
import { UNBOOK_STATUSES, type LibraryFilters, type LibraryStatusFilter } from './types';

/** Keep search strings small enough for an indexed LIKE and for the UI input. */
export const LIBRARY_QUERY_MAX_LENGTH = 80;
export const LIBRARY_INTEREST_MAX_LENGTH = 100;

/** The raw `searchParams` shape Next.js provides to a page (values may repeat). */
export type LibrarySearchParams = Record<string, string | string[] | undefined>;

/**
 * Repeated query parameters arrive as arrays. We use the first non-blank value
 * so the result is deterministic and one malformed duplicate cannot break the
 * page.
 */
export function firstSearchParamValue(value: unknown): string {
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim() !== '') return entry;
    }
    return '';
  }
  return typeof value === 'string' ? value : '';
}

function normalizeQuery(value: unknown): string {
  return firstSearchParamValue(value).trim().slice(0, LIBRARY_QUERY_MAX_LENGTH);
}

function normalizeInterest(value: unknown): string {
  return firstSearchParamValue(value).trim().slice(0, LIBRARY_INTEREST_MAX_LENGTH);
}

const statusSchema = z.union([z.literal(''), z.enum(UNBOOK_STATUSES)]).catch('');

const librarySearchParamsSchema = z.object({
  q: z.preprocess(normalizeQuery, z.string().max(LIBRARY_QUERY_MAX_LENGTH)),
  interest: z.preprocess(normalizeInterest, z.string().max(LIBRARY_INTEREST_MAX_LENGTH)),
  status: z.preprocess(firstSearchParamValue, statusSchema),
});

const EMPTY_FILTERS: LibraryFilters = { q: '', interest: '', status: '' };

/**
 * Parse untrusted `searchParams` into a bounded, typed filter object. Unknown
 * statuses become "all"; an unknown interest is normalised later against the
 * user's own interest list so other users' interests are never exposed.
 */
export function parseLibrarySearchParams(input: unknown): LibraryFilters {
  const result = librarySearchParamsSchema.safeParse(input ?? {});
  if (!result.success) return { ...EMPTY_FILTERS };

  return {
    q: result.data.q,
    interest: result.data.interest,
    status: result.data.status as LibraryStatusFilter,
  };
}

/** Escape PostgreSQL LIKE wildcards so `%` and `_` match literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** Build a literal, case-insensitive substring pattern (`ILIKE`). */
export function buildTitlePattern(query: string): string | undefined {
  const trimmed = query.trim().slice(0, LIBRARY_QUERY_MAX_LENGTH);
  if (!trimmed) return undefined;
  return `%${escapeLikePattern(trimmed)}%`;
}

export function hasActiveLibraryFilters(filters: LibraryFilters): boolean {
  return filters.q !== '' || filters.interest !== '' || filters.status !== '';
}
