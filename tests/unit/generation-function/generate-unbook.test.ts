import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const captured: { config: unknown; handler: unknown } = { config: undefined, handler: undefined };
  const createFunction = vi.fn((config: unknown, handler: unknown) => {
    captured.config = config;
    captured.handler = handler;
    return { id: 'generate-unbook' };
  });
  return {
    createFunction,
    captured,
    startOutline: vi.fn(),
    failGeneration: vi.fn(),
    listModuleWork: vi.fn(),
    runOutlineStep: vi.fn(),
    runModuleContentStep: vi.fn(),
    runQuizStep: vi.fn(),
    runCardsStep: vi.fn(),
    runTaggingStep: vi.fn(),
    runFinalizeStep: vi.fn(),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/inngest/client', () => ({ inngest: { createFunction: mocks.createFunction } }));
vi.mock('@/lib/generation/store', () => ({
  startOutline: mocks.startOutline,
  failGeneration: mocks.failGeneration,
}));
vi.mock('@/lib/generation/context', () => ({ listModuleWork: mocks.listModuleWork }));
vi.mock('@/lib/generation/steps', () => ({
  runOutlineStep: mocks.runOutlineStep,
  runModuleContentStep: mocks.runModuleContentStep,
  runQuizStep: mocks.runQuizStep,
  runCardsStep: mocks.runCardsStep,
  runTaggingStep: mocks.runTaggingStep,
  runFinalizeStep: mocks.runFinalizeStep,
}));

import { NonRetriableError } from 'inngest';
import { SOURCE_DELETED_EVENT, UNBOOK_REQUESTED_EVENT } from '@/inngest/events';
import { generateUnbook } from '@/inngest/generate-unbook';
import { SourceError, type SourceErrorCode } from '@/lib/sources/errors';

type StepRecord = { id: string; result?: unknown; error?: unknown };
type FakeStep = { run: <T>(id: string, callback: () => Promise<T>) => Promise<T> };
type HandlerArgs = { event: { data: unknown }; step: FakeStep };
type FailureHandlerArgs = {
  event: { data: { event: { data: unknown }; error?: { message?: string } } };
  step: FakeStep;
};
type FunctionConfig = {
  id: string;
  triggers: { event: string }[];
  retries?: number;
  concurrency?: { limit: number; key?: string };
  cancelOn?: { event: string; if?: string }[];
  onFailure?: (args: FailureHandlerArgs) => Promise<unknown>;
};

const config = mocks.captured.config as FunctionConfig;
const handler = mocks.captured.handler as (args: HandlerArgs) => Promise<unknown>;

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const MODULE_IDS = [
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000005',
];
const ids = { sourceId: SOURCE_ID, userId: USER_ID, unbookId: UNBOOK_ID };
const KNOWN_STRINGS = new Set([SOURCE_ID, USER_ID, UNBOOK_ID, ...MODULE_IDS]);
const ALLOWED_KEYS = new Set([
  'sourceId', 'userId', 'unbookId', 'active', 'needsOutline', 'moduleCount', 'moduleId',
  'sortOrder', 'hasContent', 'hasQuiz', 'hasCards', 'stored', 'tagged', 'charged',
  'generated', 'skipped', 'handled', 'code', 'marked',
]);
const SECRET = 'SECRET-MODEL-OUTPUT-sentinel';

function work(moduleId: string, sortOrder: number, state = { hasContent: false, hasQuiz: false, hasCards: false }) {
  return { moduleId, sortOrder, ...state };
}

function createFakeStep(): { step: FakeStep; records: StepRecord[] } {
  const records: StepRecord[] = [];
  const step: FakeStep = {
    run: async <T>(id: string, callback: () => Promise<T>): Promise<T> => {
      const record: StepRecord = { id };
      records.push(record);
      try {
        const value = await callback();
        record.result = value;
        return value;
      } catch (error) {
        record.error = error;
        throw error;
      }
    },
  };
  return { step, records };
}

async function caught<T>(promise: Promise<T>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

function requireOnFailure(): NonNullable<FunctionConfig['onFailure']> {
  const onFailure = config.onFailure;
  if (!onFailure) throw new Error('onFailure callback was not registered');
  return onFailure;
}

function expectMetadata(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectMetadata);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, nested] of Object.entries(value)) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
      expectMetadata(nested);
    }
    return;
  }
  if (typeof value === 'string') {
    expect(KNOWN_STRINGS.has(value)).toBe(true);
    return;
  }
  expect(typeof value === 'boolean' || typeof value === 'number').toBe(true);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.startOutline.mockResolvedValue({ state: 'outline', moduleCount: 0 });
  mocks.listModuleWork.mockResolvedValue([work(MODULE_IDS[0]!, 0)]);
  mocks.runOutlineStep.mockResolvedValue({ moduleCount: 1 });
  mocks.runModuleContentStep.mockResolvedValue({ stored: true });
  mocks.runQuizStep.mockResolvedValue({ stored: true });
  mocks.runCardsStep.mockResolvedValue({ stored: true });
  mocks.runTaggingStep.mockResolvedValue({ tagged: true });
  mocks.runFinalizeStep.mockResolvedValue({ charged: true });
  mocks.failGeneration.mockResolvedValue(undefined);
});

describe('generate-unbook configuration', () => {
  it('registers the requested trigger, bounded retries, per-unbook concurrency, and cancellation', () => {
    expect(generateUnbook).toBeDefined();
    expect(typeof handler).toBe('function');
    expect(config.id).toBe('generate-unbook');
    expect(config.triggers).toEqual([{ event: UNBOOK_REQUESTED_EVENT }]);
    expect(config.retries).toBe(2);
    expect(config.concurrency).toEqual({ limit: 1, key: 'event.data.unbookId' });
    expect(config.cancelOn).toEqual([
      {
        event: SOURCE_DELETED_EVENT,
        if: 'async.data.sourceId == event.data.sourceId && async.data.userId == event.data.userId',
      },
    ]);
  });
});

describe('generate-unbook happy path', () => {
  it('runs outline, one sequential module chain, tagging, then finalize in order', async () => {
    const { step, records } = createFakeStep();

    const result = await handler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).toEqual([
      'start', 'outline', 'list-work',
      `content-${MODULE_IDS[0]}`, `quiz-${MODULE_IDS[0]}`, `cards-${MODULE_IDS[0]}`,
      'tagging', 'finalize',
    ]);
    expect(mocks.runOutlineStep).toHaveBeenCalledWith(ids);
    expect(mocks.runModuleContentStep).toHaveBeenCalledWith(ids, MODULE_IDS[0]);
    expect(mocks.runQuizStep).toHaveBeenCalledWith(ids, MODULE_IDS[0]);
    expect(mocks.runCardsStep).toHaveBeenCalledWith(ids, MODULE_IDS[0]);
    expect(mocks.runTaggingStep).toHaveBeenCalledWith(ids);
    expect(mocks.runFinalizeStep).toHaveBeenCalledWith(ids);
    expect(result).toEqual({ ...ids, moduleCount: 1, generated: true, charged: true });
  });

  it('keeps every durable step output to IDs, counts, and booleans', async () => {
    const { step, records } = createFakeStep();

    const result = await handler({ event: { data: ids }, step });

    for (const record of records) expectMetadata(record.result);
    expectMetadata(result);
    const json = JSON.stringify({ records, result });
    expect(json).not.toContain(SECRET);
  });
});

describe('generate-unbook resume and skips', () => {
  it('never repeats stored content, quiz, or cards on resume', async () => {
    const { step, records } = createFakeStep();
    mocks.startOutline.mockResolvedValue({ state: 'modules', moduleCount: 2 });
    mocks.listModuleWork.mockResolvedValue([
      work(MODULE_IDS[0]!, 0, { hasContent: true, hasQuiz: true, hasCards: true }),
      work(MODULE_IDS[1]!, 1, { hasContent: true, hasQuiz: false, hasCards: false }),
    ]);

    const result = await handler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).toEqual([
      'start', 'list-work', `quiz-${MODULE_IDS[1]}`, `cards-${MODULE_IDS[1]}`, 'tagging', 'finalize',
    ]);
    expect(mocks.runOutlineStep).not.toHaveBeenCalled();
    expect(mocks.runModuleContentStep).not.toHaveBeenCalled();
    expect(mocks.runQuizStep).toHaveBeenCalledTimes(1);
    expect(mocks.runCardsStep).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ...ids, moduleCount: 2, generated: true, charged: true });
  });

  it('skips the outline step when modules already exist', async () => {
    const { step, records } = createFakeStep();
    mocks.startOutline.mockResolvedValue({ state: 'modules', moduleCount: 1 });

    await handler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).not.toContain('outline');
    expect(mocks.runOutlineStep).not.toHaveBeenCalled();
  });

  it('runs at most three modules at once', async () => {
    const { step } = createFakeStep();
    mocks.listModuleWork.mockResolvedValue(MODULE_IDS.map((moduleId, sortOrder) => work(moduleId, sortOrder)));
    let active = 0;
    let maximum = 0;
    mocks.runModuleContentStep.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { stored: true };
    });

    await handler({ event: { data: ids }, step });

    expect(maximum).toBe(3);
    expect(mocks.runModuleContentStep).toHaveBeenCalledTimes(5);
    expect(mocks.runQuizStep).toHaveBeenCalledTimes(5);
    expect(mocks.runCardsStep).toHaveBeenCalledTimes(5);
  });

  it('ends gracefully when the Unbook is already complete or deleted at start', async () => {
    const { step, records } = createFakeStep();
    mocks.startOutline.mockResolvedValue({ state: 'skip', moduleCount: 0 });

    const result = await handler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).toEqual(['start']);
    expect(mocks.listModuleWork).not.toHaveBeenCalled();
    expect(result).toEqual({ ...ids, moduleCount: 0, generated: false });
  });

  it('ends gracefully without throwing when the pair disappears before listing work', async () => {
    const { step, records } = createFakeStep();
    mocks.listModuleWork.mockResolvedValue(null);

    const result = await handler({ event: { data: ids }, step });

    expect(records.map((record) => record.id)).toEqual(['start', 'outline', 'list-work']);
    expect(mocks.runTaggingStep).not.toHaveBeenCalled();
    expect(mocks.runFinalizeStep).not.toHaveBeenCalled();
    expect(result).toEqual({ ...ids, moduleCount: 0, generated: false, charged: false });
  });
});

describe('generate-unbook error mapping', () => {
  it('rejects an invalid event as non-retriable before running any step', async () => {
    const { step, records } = createFakeStep();

    const error = await caught(handler({ event: { data: { ...ids, text: SECRET } }, step }));

    expect(error).toBeInstanceOf(NonRetriableError);
    expect((error as Error).message).toBe('invalidInput');
    expect(records).toEqual([]);
    expect(mocks.startOutline).not.toHaveBeenCalled();
  });

  it.each(['invalidInput', 'notFound', 'configurationMissing', 'rightsRequired'] as const)(
    'maps %s to a NonRetriableError carrying only the safe code',
    async (code) => {
      const { step } = createFakeStep();
      mocks.startOutline.mockResolvedValue({ state: 'modules', moduleCount: 1 });
      mocks.runModuleContentStep.mockRejectedValue(new SourceError(code, SECRET));

      const error = await caught(handler({ event: { data: ids }, step }));

      expect(error).toBeInstanceOf(NonRetriableError);
      expect((error as Error).message).toBe(code);
      expect(JSON.stringify(error)).not.toContain(SECRET);
    },
  );

  it.each(['generationInvalid', 'generationUnavailable'] as const)(
    'keeps %s retriable as a sanitized SourceError',
    async (code) => {
      const { step } = createFakeStep();
      mocks.startOutline.mockResolvedValue({ state: 'modules', moduleCount: 1 });
      mocks.runModuleContentStep.mockRejectedValue(new SourceError(code, SECRET));

      const error = await caught(handler({ event: { data: ids }, step }));

      expect(error).toBeInstanceOf(SourceError);
      expect(error).not.toBeInstanceOf(NonRetriableError);
      expect((error as SourceError).code).toBe(code);
      expect((error as Error).message).not.toContain(SECRET);
      expect('cause' in (error as object)).toBe(false);
    },
  );

  it('sanitizes a raw driver failure into a fresh retriable generationUnavailable error', async () => {
    const { step, records } = createFakeStep();
    mocks.startOutline.mockResolvedValue({ state: 'modules', moduleCount: 1 });
    const raw = new Error(`DB deadlock with ${SECRET}`);
    mocks.runModuleContentStep.mockRejectedValue(raw);

    const error = await caught(handler({ event: { data: ids }, step }));

    expect(error).not.toBe(raw);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).code).toBe('generationUnavailable');
    expect((error as Error).message).toBe('generationUnavailable');
    expect(records.at(-1)?.id).toBe(`content-${MODULE_IDS[0]}`);
  });
});

describe('generate-unbook onFailure handler', () => {
  it.each([
    ['notFound', 'notFound'],
    ['configurationMissing', 'configurationMissing'],
    ['rightsRequired', 'rightsRequired'],
  ] as const)('marks the failed Unbook with %s', async (message, expected) => {
    const { step, records } = createFakeStep();
    const onFailure = requireOnFailure();

    const result = await onFailure({
      event: { data: { event: { data: ids }, error: { message } } },
      step,
    });

    expect(mocks.failGeneration).toHaveBeenCalledWith(ids, expected satisfies SourceErrorCode);
    expect(records.map((record) => record.id)).toEqual(['fail-generation']);
    expect(records[0]?.result).toBe(true);
    expect(result).toEqual({ ...ids, code: expected, marked: true });
  });

  it('falls back to generationUnavailable without leaking a vendor message', async () => {
    const { step } = createFakeStep();
    const onFailure = requireOnFailure();

    const result = await onFailure({
      event: {
        data: { event: { data: ids }, error: { message: `vendor stack ${SECRET}` } },
      },
      step,
    });

    expect(mocks.failGeneration).toHaveBeenCalledWith(ids, 'generationUnavailable');
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('ignores an invalid failure DTO without touching the store', async () => {
    const { step, records } = createFakeStep();
    const onFailure = requireOnFailure();

    const result = await onFailure({
      event: { data: { event: { data: { ...ids, unbookId: 'bad' } }, error: { message: 'notFound' } } },
      step,
    });

    expect(result).toEqual({ handled: false });
    expect(records).toEqual([]);
    expect(mocks.failGeneration).not.toHaveBeenCalled();
  });

  it('fails the failure step with a sanitized error instead of swallowing a raw DB outage', async () => {
    const { step, records } = createFakeStep();
    mocks.failGeneration.mockRejectedValue(new Error(`connection refused ${SECRET}`));
    const onFailure = requireOnFailure();

    const error = await caught(
      onFailure({
        event: { data: { event: { data: ids }, error: { message: 'configurationMissing' } } },
        step,
      }),
    );

    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).code).toBe('generationUnavailable');
    expect((error as Error).message).not.toContain(SECRET);
    expect(records.map((record) => record.id)).toEqual(['fail-generation']);
    expect(records[0]?.error).toBeInstanceOf(SourceError);
  });
});
