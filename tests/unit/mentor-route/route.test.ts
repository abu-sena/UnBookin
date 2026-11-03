import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runMentorTurn: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mentor/chat', () => ({ runMentorTurn: mocks.runMentorTurn }));

import * as routeModule from '@/app/api/mentor/[threadId]/route';
import { POST, maxDuration } from '@/app/api/mentor/[threadId]/route';

const THREAD_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/mentor/[threadId]', () => {
  it('exports POST only and a five-minute max duration', () => {
    expect(maxDuration).toBe(300);
    expect('GET' in routeModule).toBe(false);
    expect('PUT' in routeModule).toBe(false);
    expect('DELETE' in routeModule).toBe(false);
  });

  it('delegates the request and resolved thread id to runMentorTurn', async () => {
    const response = new Response('ok', { status: 200 });
    mocks.runMentorTurn.mockResolvedValue(response);
    const request = new Request(`http://localhost:3000/api/mentor/${THREAD_ID}`, {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      body: JSON.stringify({ message: 'Apa intinya?' }),
    });

    await expect(POST(request, { params: Promise.resolve({ threadId: THREAD_ID }) })).resolves.toBe(
      response,
    );
    expect(mocks.runMentorTurn).toHaveBeenCalledWith(request, THREAD_ID);
  });
});
