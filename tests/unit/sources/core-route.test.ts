import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadProgress: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));

vi.mock('@/lib/sources/queries', () => ({
  loadSourceProgressForUser: mocks.loadProgress,
}));

import { GET } from '@/app/api/sources/[unbookId]/route';
import * as routeModule from '@/app/api/sources/[unbookId]/route';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

function routeRequest() {
  return new Request(`http://localhost:3000/api/sources/${UNBOOK_ID}`);
}

function routeContext() {
  return { params: Promise.resolve({ unbookId: UNBOOK_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/sources/[unbookId]', () => {
  it('answers 401 with no-store for unauthenticated callers and queries nothing', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET(routeRequest(), routeContext());

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.loadProgress).not.toHaveBeenCalled();
  });

  it('answers 404 with no-store for an invalid id without touching the session query', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: USER_ID });

    const response = await GET(new Request('http://localhost:3000/api/sources/nope'), {
      params: Promise.resolve({ unbookId: 'nope' }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.loadProgress).not.toHaveBeenCalled();
  });

  it('answers 404 with no-store for a not-owned unbook', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: USER_ID });
    mocks.loadProgress.mockResolvedValue(null);

    const response = await GET(routeRequest(), routeContext());

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.loadProgress).toHaveBeenCalledWith(USER_ID, UNBOOK_ID);
  });

  it('returns the safe progress payload as private, no-store JSON', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: USER_ID });
    const progress = {
      unbookId: UNBOOK_ID,
      title: 'Buku',
      sourceId: null,
      sourceStatus: null,
      unbookStatus: 'queued',
      stage: 'uploading',
      progressPct: 0,
      embeddedChunks: 0,
      totalChunks: 0,
      errorCode: null,
    };
    mocks.loadProgress.mockResolvedValue(progress);

    const response = await GET(routeRequest(), routeContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(progress);
  });

  it('maps transient internal failures to a retryable safe 503 without leaking detail', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: USER_ID });
    mocks.loadProgress.mockRejectedValue(new Error('connection refused secret-details'));

    const response = await GET(routeRequest(), routeContext());

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: 'processingFailed' });
    expect(body).not.toContain('secret-details');
  });

  it('exports no removed route segment config (Cache Components)', () => {
    // `dynamic` was removed in Next 16 with Cache Components; the route must
    // rely on request-time APIs (auth session) instead.
    expect('dynamic' in routeModule).toBe(false);
  });
});
