import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ requireUser: mocks.requireUser }));

import {
  deriveProgressStage,
  getMySourceProgress,
  loadSourceProgressForUser,
  parseStoredErrorCode,
  parseStoredStage,
} from '@/lib/sources/queries';
import { createRecordingDatabase } from './core-recording-db';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

function progressRow(overrides: Record<string, unknown> = {}) {
  return {
    unbookId: UNBOOK_ID,
    title: 'Buku Produk',
    unbookStatus: 'generating',
    progressPct: 40,
    currentStage: 'generating',
    sourceId: SOURCE_ID,
    sourceStatus: 'ready',
    sourceErrorCode: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadSourceProgressForUser', () => {
  it('maps the owned row, chunk counters and stage to a safe payload', async () => {
    const rec = createRecordingDatabase([[progressRow()], [{ total: 5, embedded: 3 }]]);

    const progress = await loadSourceProgressForUser(USER_ID, UNBOOK_ID, rec.database);

    expect(progress).toEqual({
      unbookId: UNBOOK_ID,
      title: 'Buku Produk',
      sourceId: SOURCE_ID,
      sourceStatus: 'ready',
      unbookStatus: 'generating',
      stage: 'generating',
      progressPct: 40,
      embeddedChunks: 3,
      totalChunks: 5,
      errorCode: null,
    });
  });

  it('filters every query by the server identity and never exposes it', async () => {
    const rec = createRecordingDatabase([[progressRow()], [{ total: 0, embedded: 0 }]]);

    await loadSourceProgressForUser(USER_ID, UNBOOK_ID, rec.database);

    const [mainSql] = rec.queries.map((query) => query.sql);
    expect(mainSql).toContain('left join');
    expect(mainSql).toContain('"user_id"');
    // The unbook id and the session identity are the only user-supplied params.
    expect(rec.queries[0]?.params).toEqual(expect.arrayContaining([USER_ID, UNBOOK_ID]));
    expect(rec.queries[1]?.params).toEqual([SOURCE_ID]);
    expect(rec.queries[1]?.sql).toContain('filter');
    expect(rec.queries[1]?.sql).toContain('is not null');
  });

  it('returns null for an unknown or not-owned unbook', async () => {
    const rec = createRecordingDatabase([[]]);

    const progress = await loadSourceProgressForUser(USER_ID, UNBOOK_ID, rec.database);

    expect(progress).toBeNull();
  });

  it('rejects a malformed unbook id without querying', async () => {
    const rec = createRecordingDatabase([]);

    const progress = await loadSourceProgressForUser(USER_ID, 'not-a-uuid', rec.database);

    expect(progress).toBeNull();
    expect(rec.queries).toHaveLength(0);
  });

  it('re-derives the stage from statuses when current_stage is unknown', async () => {
    const rec = createRecordingDatabase([
      [
        progressRow({
          currentStage: 'weird-vendor-value',
          unbookStatus: 'queued',
          sourceStatus: 'extracting',
        }),
      ],
      [{ total: 0, embedded: 0 }],
    ]);

    const progress = await loadSourceProgressForUser(USER_ID, UNBOOK_ID, rec.database);

    expect(progress?.stage).toBe('reading');
  });

  it('shows failed stage and maps unknown stored error codes to processingFailed', async () => {
    const rec = createRecordingDatabase([
      [
        progressRow({
          unbookStatus: 'failed',
          sourceStatus: 'failed',
          currentStage: 'failed',
          sourceErrorCode: 'vendor: something exploded',
        }),
      ],
      [{ total: 2, embedded: 2 }],
    ]);

    const progress = await loadSourceProgressForUser(USER_ID, UNBOOK_ID, rec.database);

    expect(progress?.stage).toBe('failed');
    expect(progress?.errorCode).toBe('processingFailed');
  });

  it('passes known safe error codes through', async () => {
    const rec = createRecordingDatabase([
      [
        progressRow({
          unbookStatus: 'failed',
          sourceStatus: 'failed',
          currentStage: 'failed',
          sourceErrorCode: 'quotaExceeded',
        }),
      ],
      [{ total: 0, embedded: 0 }],
    ]);

    const progress = await loadSourceProgressForUser(USER_ID, UNBOOK_ID, rec.database);

    expect(progress?.errorCode).toBe('quotaExceeded');
  });

  it('hides the error code unless the flow failed', async () => {
    const rec = createRecordingDatabase([
      [progressRow({ sourceErrorCode: 'quotaExceeded' })],
      [{ total: 0, embedded: 0 }],
    ]);

    const progress = await loadSourceProgressForUser(USER_ID, UNBOOK_ID, rec.database);

    expect(progress?.errorCode).toBeNull();
  });
});

describe('getMySourceProgress', () => {
  it('authenticates from the server session before any query', async () => {
    mocks.requireUser.mockRejectedValue(new Error('NEXT_REDIRECT'));

    await expect(getMySourceProgress(UNBOOK_ID)).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.requireUser).toHaveBeenCalledWith('/library');
  });
});

describe('stage and error parsing', () => {
  it('accepts only the controlled stage union', () => {
    expect(parseStoredStage('embedding')).toBe('embedding');
    expect(parseStoredStage(' uploading ')).toBe('uploading');
    expect(parseStoredStage('chunked-by-vendor')).toBeNull();
    expect(parseStoredStage('')).toBeNull();
    expect(parseStoredStage(null)).toBeNull();
  });

  it('derives fallback stages from persisted statuses', () => {
    expect(deriveProgressStage('ready', 'ready', null)).toBe('ready');
    expect(deriveProgressStage('outlining', 'ready', 'not-a-stage')).toBe('outlining');
    expect(deriveProgressStage('generating', 'ready', 'not-a-stage')).toBe('generating');
    expect(deriveProgressStage('failed', 'ready', null)).toBe('failed');
    expect(deriveProgressStage('queued', 'failed', null)).toBe('failed');
    expect(deriveProgressStage('queued', 'extracting', null)).toBe('reading');
    // A parseable stored stage always wins.
    expect(deriveProgressStage('ready', 'ready', 'embedding')).toBe('embedding');
  });

  it('maps unknown stored error codes safely', () => {
    expect(parseStoredErrorCode('jobsUnavailable')).toBe('jobsUnavailable');
    expect(parseStoredErrorCode(' random-db-value ')).toBe('processingFailed');
    expect(parseStoredErrorCode('')).toBeNull();
    expect(parseStoredErrorCode(null)).toBeNull();
  });
});
