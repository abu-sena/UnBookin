import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const captured: { config: unknown; handler: unknown } = { config: undefined, handler: undefined };
  return {
    captured,
    createFunction: vi.fn((config: unknown, handler: unknown) => {
      captured.config = config;
      captured.handler = handler;
      return { id: 'regenerate-quiz' };
    }),
    regenerateQuizVersion: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/inngest/client', () => ({ inngest: { createFunction: mocks.createFunction } }));
vi.mock('@/lib/generation/quiz-version', () => ({
  regenerateQuizVersion: mocks.regenerateQuizVersion,
}));

import { NonRetriableError } from 'inngest';
import { QUIZ_REGENERATE_EVENT, SOURCE_DELETED_EVENT } from '@/inngest/events';
import { regenerateQuiz } from '@/inngest/regenerate-quiz';

type FunctionConfig = {
  id: string;
  triggers: { event: string }[];
  retries?: number;
  concurrency?: { limit: number; key?: string };
  cancelOn?: { event: string; if?: string }[];
};
type Step = { run: <T>(id: string, callback: () => Promise<T>) => Promise<T> };
type HandlerArgs = { event: { data: unknown }; step: Step };

const config = mocks.captured.config as FunctionConfig;
const handler = mocks.captured.handler as (args: HandlerArgs) => Promise<unknown>;

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const MODULE_ID = '30000000-0000-4000-8000-000000000001';
const ids = { userId: USER_ID, sourceId: SOURCE_ID, unbookId: UNBOOK_ID, moduleId: MODULE_ID };

function fakeStep(): Step {
  return { run: async <T>(_id: string, callback: () => Promise<T>) => callback() };
}

beforeEach(() => {
  mocks.regenerateQuizVersion.mockReset();
  mocks.regenerateQuizVersion.mockResolvedValue({
    status: 'stored',
    version: 2,
    versionCount: 2,
  });
});

describe('regenerate-quiz configuration', () => {
  it('uses one trigger, bounded retries, per-module concurrency and source cancellation', () => {
    expect(regenerateQuiz).toBeDefined();
    expect(typeof handler).toBe('function');
    expect(config.id).toBe('regenerate-quiz');
    expect(config.triggers).toEqual([{ event: QUIZ_REGENERATE_EVENT }]);
    expect(config.retries).toBe(2);
    expect(config.concurrency).toEqual({ limit: 1, key: 'event.data.moduleId' });
    expect(config.cancelOn).toEqual([
      {
        event: SOURCE_DELETED_EVENT,
        if: 'async.data.sourceId == event.data.sourceId && async.data.userId == event.data.userId',
      },
    ]);
  });
});

describe('regenerate-quiz handler', () => {
  it('runs exactly one step with IDs-only result metadata', async () => {
    const result = await handler({ event: { data: ids }, step: fakeStep() });

    expect(mocks.regenerateQuizVersion).toHaveBeenCalledWith(ids);
    expect(result).toEqual({
      ...ids,
      status: 'stored',
      version: 2,
      versionCount: 2,
    });
  });

  it('rejects malformed event data without running the model', async () => {
    await expect(
      handler({ event: { data: { ...ids, moduleId: 'nope' } }, step: fakeStep() }),
    ).rejects.toBeInstanceOf(NonRetriableError);
    expect(mocks.regenerateQuizVersion).not.toHaveBeenCalled();
  });
});
