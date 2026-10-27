import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serve: vi.fn(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() })),
  createFunction: vi.fn(() => ({ id: 'registered' })),
  send: vi.fn(async () => ({ ids: ['event-id'] })),
  ingestSource: { id: 'ingest-source' },
  generateUnbook: { id: 'generate-unbook' },
  regenerateQuiz: { id: 'regenerate-quiz' },
}));

vi.mock('inngest/next', () => ({ serve: mocks.serve }));
vi.mock('server-only', () => ({}));
vi.mock('inngest', async (importOriginal) => {
  // The real client keeps createFunction unmocked; only its identity matters here.
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, Inngest: class { createFunction = mocks.createFunction; send = mocks.send; } };
});
vi.mock('@/inngest/client', () => ({ inngest: { id: 'unbookin' } }));
vi.mock('@/inngest/ingest-source', () => ({ ingestSource: mocks.ingestSource }));
vi.mock('@/inngest/generate-unbook', () => ({ generateUnbook: mocks.generateUnbook }));
vi.mock('@/inngest/regenerate-quiz', () => ({ regenerateQuiz: mocks.regenerateQuiz }));

type RouteModule = typeof import('@/app/api/inngest/route');

beforeEach(() => {
  // Vitest resets mocked module state between tests, so the route is imported
  // fresh and `serve` must run once per test to be observed deterministically.
  vi.resetModules();
});

describe('inngest route', () => {
  it('serves all functions with a 300 second max duration', async () => {
    const route: RouteModule = await import('@/app/api/inngest/route');
    expect(route.maxDuration).toBe(300);
    expect(route.GET).toBeDefined();
    expect(route.POST).toBeDefined();
    expect(route.PUT).toBeDefined();
    expect(mocks.serve).toHaveBeenCalledWith({
      client: { id: 'unbookin' },
      functions: [mocks.ingestSource, mocks.generateUnbook, mocks.regenerateQuiz],
    });
  });
});
