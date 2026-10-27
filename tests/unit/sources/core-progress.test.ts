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
    moduleCount: 5,
    modulesCompleted: 2,
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
      moduleCount: 5,
      modulesCompleted: 2,
      errorCode: null,
    });
  });

  it('authorizes the base unbook row: WHERE covers id AND user_id with the session identity', async () => {
    const rec = createRecordingDatabase([[progressRow()], [{ total: 0, embedded: 0 }]]);

    await loadSourceProgressForUser(USER_ID, UNBOOK_ID, rec.database);

    const [mainSql] = rec.queries.map((query) => query.sql);
    expect(mainSql).toContain('left join');
    // The join predicate alone is NOT authorization: the base row must be
    // filtered by BOTH the unbook id and the unbook owner.
    expect(mainSql).toMatch(/where \("unbooks"\."id" = \$2 and "unbooks"\."user_id" = \$3\)/);
    // $1 is the join's session identity; the WHERE binds the requested id and
    // the SAME session identity (never a client-supplied owner).
    expect(rec.queries[0]?.params).toEqual([USER_ID, UNBOOK_ID, USER_ID, 1]);
    expect(rec.queries[1]?.params).toEqual([SOURCE_ID]);
    expect(mainSql).toContain('"modules"."content" is not null');
    expect(mainSql).toContain("not (\"modules\".\"content\" ? 'pending')");
    expect(mainSql).toContain('"modules"."unbook_id" = "unbooks"."id"');
  });

  it('returns null for an unknown or not-owned unbook and never reads chunks', async () => {
    const rec = createRecordingDatabase([[]]);

    const progress = await loadSourceProgressForUser(USER_ID, UNBOOK_ID, rec.database);

    expect(progress).toBeNull();
    // Another user's unbook (filtered out by the owner predicate) never
    // reaches the chunk-count query either.
    expect(rec.queries).toHaveLength(1);
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

  it('maps generation failure on a ready source without a source error', async () => {
    const rec = createRecordingDatabase([[progressRow({ unbookStatus: 'failed', currentStage: 'tagging' })], [{ total: 2, embedded: 2 }]]);
    const progress = await loadSourceProgressForUser(USER_ID, UNBOOK_ID, rec.database);
    expect(progress).toMatchObject({ stage: 'failed', errorCode: 'generationUnavailable', moduleCount: 5, modulesCompleted: 2 });
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
    expect(parseStoredStage('tagging')).toBe('tagging');
    expect(deriveProgressStage('generating', 'ready', 'tagging')).toBe('tagging');
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
  });

  it('decides terminal statuses first so stale stages cannot fake progress', () => {
    // ready/failed unbooks and failed sources STOP a stale stored stage.
    expect(deriveProgressStage('ready', 'ready', 'embedding')).toBe('ready');
    expect(deriveProgressStage('ready', 'ready', 'uploading')).toBe('ready');
    expect(deriveProgressStage('failed', 'ready', 'embedding')).toBe('failed');
    expect(deriveProgressStage('queued', 'failed', 'ingested')).toBe('failed');
  });

  it('preserves the nonterminal handoff and pipeline stages', () => {
    // queued unbook + ready source + `ingested` stage is a REAL handoff.
    expect(deriveProgressStage('queued', 'ready', 'ingested')).toBe('ingested');
    expect(deriveProgressStage('queued', 'extracting', 'embedding')).toBe('embedding');
    expect(deriveProgressStage('queued', 'ready', 'weird-vendor-value')).toBe('reading');
  });

  it('maps unknown stored error codes safely', () => {
    expect(parseStoredErrorCode('jobsUnavailable')).toBe('jobsUnavailable');
    expect(parseStoredErrorCode(' random-db-value ')).toBe('processingFailed');
    expect(parseStoredErrorCode('')).toBeNull();
    expect(parseStoredErrorCode(null)).toBeNull();
  });
});
