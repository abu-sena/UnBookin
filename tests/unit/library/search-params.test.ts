import { describe, expect, it } from 'vitest';
import {
  LIBRARY_QUERY_MAX_LENGTH,
  buildTitlePattern,
  escapeLikePattern,
  hasActiveLibraryFilters,
  parseLibrarySearchParams,
} from '@/lib/library/search-params';

describe('parseLibrarySearchParams', () => {
  it('trims and combines q, interest and status without accepting a client user id', () => {
    const filters = parseLibrarySearchParams({
      q: '  Atomic Habits  ',
      interest: ' personal-development-productivity ',
      status: 'ready',
      userId: 'attacker',
    });

    expect(filters).toEqual({
      q: 'Atomic Habits',
      interest: 'personal-development-productivity',
      status: 'ready',
    });
  });

  it('normalises repeated parameters by taking the first non-blank value', () => {
    const filters = parseLibrarySearchParams({
      q: ['', 'Deep Work'],
      interest: ['', 'islamic-studies'],
      status: ['', 'failed'],
    });

    expect(filters).toEqual({
      q: 'Deep Work',
      interest: 'islamic-studies',
      status: 'failed',
    });
  });

  it('falls back safely for unknown statuses, non-string values and empty input', () => {
    expect(parseLibrarySearchParams({ status: 'archived' }).status).toBe('');
    expect(parseLibrarySearchParams(undefined)).toEqual({ q: '', interest: '', status: '' });
    expect(parseLibrarySearchParams({ q: ['x', 42] }).q).toBe('x');
    expect(parseLibrarySearchParams('not-an-object')).toEqual({
      q: '',
      interest: '',
      status: '',
    });
  });

  it('bounds long search strings instead of sending them to the database', () => {
    const filters = parseLibrarySearchParams({ q: 'a'.repeat(LIBRARY_QUERY_MAX_LENGTH + 50) });

    expect(filters.q).toHaveLength(LIBRARY_QUERY_MAX_LENGTH);
  });
});

describe('title matching', () => {
  it('escapes LIKE wildcards so the search stays literal', () => {
    expect(escapeLikePattern('100%_off\\today')).toBe('100\\%\\_off\\\\today');
    expect(buildTitlePattern('  50%_done\\  ')).toBe('%50\\%\\_done\\\\%');
  });

  it('returns no pattern for a blank title search', () => {
    expect(buildTitlePattern('   ')).toBeUndefined();
  });

  it('detects whether any filter is active', () => {
    expect(hasActiveLibraryFilters({ q: '', interest: '', status: '' })).toBe(false);
    expect(hasActiveLibraryFilters({ q: 'focus', interest: '', status: '' })).toBe(true);
    expect(hasActiveLibraryFilters({ q: '', interest: '', status: 'ready' })).toBe(true);
  });
});
