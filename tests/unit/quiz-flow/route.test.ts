import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serve: vi.fn(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() })),
  ingestSource: { id: 'ingest-source' },
  generateUnbook: { id: 'generate-unbook' },
  regenerateQuiz: { id: 'regenerate-quiz' },
}));

vi.mock('inngest/next', () => ({ serve: mocks.serve }));
vi.mock('@/inngest/client', () => ({ inngest: { id: 'unbookin' } }));
vi.mock('@/inngest/ingest-source', () => ({ ingestSource: mocks.ingestSource }));
vi.mock('@/inngest/generate-unbook', () => ({ generateUnbook: mocks.generateUnbook }));
vi.mock('@/inngest/regenerate-quiz', () => ({ regenerateQuiz: mocks.regenerateQuiz }));

beforeEach(() => {
  vi.resetModules();
  mocks.serve.mockClear();
});

describe('inngest route registration', () => {
  it('registers the regenerate-quiz function with the other workers', async () => {
    const route: typeof import('@/app/api/inngest/route') = await import(
      '@/app/api/inngest/route'
    );

    expect(route.maxDuration).toBe(300);
    expect(mocks.serve).toHaveBeenCalledWith({
      client: { id: 'unbookin' },
      functions: [mocks.ingestSource, mocks.generateUnbook, mocks.regenerateQuiz],
    });
  });
});
