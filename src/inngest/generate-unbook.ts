import 'server-only';
import { NonRetriableError, type GetStepTools } from 'inngest';
import { listModuleWork } from '@/lib/generation/context';
import type { GenerationIdentity } from '@/lib/generation/internal';
import {
  runCardsStep,
  runFinalizeStep,
  runModuleContentStep,
  runOutlineStep,
  runQuizStep,
  runTaggingStep,
} from '@/lib/generation/steps';
import { failGeneration, startOutline } from '@/lib/generation/store';
import { isSourceErrorCode, SourceError, type SourceErrorCode } from '@/lib/sources/errors';
import { inngest } from './client';

type StepTools = NonNullable<GetStepTools<typeof inngest>>;
import {
  SOURCE_DELETED_EVENT,
  UNBOOK_REQUESTED_EVENT,
  unbookRequestedDataSchema,
} from './events';

const MODULE_BATCH_SIZE = 3;

const NON_RETRIABLE_CODES: ReadonlySet<SourceErrorCode> = new Set([
  'invalidInput',
  'notFound',
  'configurationMissing',
  'rightsRequired',
]);

function toStepError(error: unknown): Error {
  const code: SourceErrorCode =
    error instanceof SourceError ? error.code : 'generationUnavailable';
  if (NON_RETRIABLE_CODES.has(code)) return new NonRetriableError(code);
  return new SourceError(code);
}

async function runStep<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toStepError(error);
  }
}

type ModuleWork = NonNullable<Awaited<ReturnType<typeof listModuleWork>>>[number];

async function generateModule(ids: GenerationIdentity, work: ModuleWork, step: StepTools) {
  if (!work.hasContent) {
    await step.run(`content-${work.moduleId}`, () =>
      runStep(() => runModuleContentStep(ids, work.moduleId)),
    );
  }
  if (!work.hasQuiz) {
    await step.run(`quiz-${work.moduleId}`, () =>
      runStep(() => runQuizStep(ids, work.moduleId)),
    );
  }
  if (!work.hasCards) {
    await step.run(`cards-${work.moduleId}`, () =>
      runStep(() => runCardsStep(ids, work.moduleId)),
    );
  }
}

export const generateUnbook = inngest.createFunction(
  {
    id: 'generate-unbook',
    triggers: [{ event: UNBOOK_REQUESTED_EVENT }],
    retries: 2,
    concurrency: { limit: 1, key: 'event.data.unbookId' },
    cancelOn: [
      {
        event: SOURCE_DELETED_EVENT,
        if: 'async.data.sourceId == event.data.sourceId && async.data.userId == event.data.userId',
      },
    ],
    onFailure: async ({ event, step }) => {
      const dto: unknown = event.data.event.data;
      const parsed = unbookRequestedDataSchema.safeParse(dto);
      if (!parsed.success) return { handled: false as const };
      const message = event.data.error?.message;
      const code: SourceErrorCode = isSourceErrorCode(message)
        ? message
        : 'generationUnavailable';
      const marked = await step.run('fail-generation', () =>
        runStep(async () => {
          await failGeneration(parsed.data, code);
          return true;
        }),
      );
      return { ...parsed.data, code, marked };
    },
  },
  async ({ event, step }) => {
    const parsed = unbookRequestedDataSchema.safeParse(event.data);
    if (!parsed.success) throw new NonRetriableError('invalidInput');
    const ids: GenerationIdentity = parsed.data;

    const start = await step.run('start', () =>
      runStep(async () => {
        const result = await startOutline(ids);
        return {
          active: result.state !== 'skip',
          needsOutline: result.state === 'outline',
          moduleCount: result.moduleCount,
        };
      }),
    );
    if (!start.active) return { ...ids, moduleCount: start.moduleCount, generated: false };

    if (start.needsOutline) {
      await step.run('outline', () => runStep(() => runOutlineStep(ids)));
    }

    const work = await step.run('list-work', () => runStep(() => listModuleWork(ids)));
    if (!work) return { ...ids, moduleCount: 0, generated: false, charged: false };

    for (let startIdx = 0; startIdx < work.length; startIdx += MODULE_BATCH_SIZE) {
      const batch = work.slice(startIdx, startIdx + MODULE_BATCH_SIZE);
      await Promise.all(batch.map((module) => generateModule(ids, module, step)));
    }

    await step.run('tagging', () => runStep(() => runTaggingStep(ids)));
    const finalize = await step.run('finalize', () =>
      runStep(() => runFinalizeStep(ids)),
    );

    return {
      ...ids,
      moduleCount: work.length,
      generated: true,
      charged: finalize.charged,
    };
  },
);
