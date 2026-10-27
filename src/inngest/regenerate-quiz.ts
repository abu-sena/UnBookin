import 'server-only';
import { NonRetriableError } from 'inngest';
import { regenerateQuizVersion } from '@/lib/generation/quiz-version';
import { SourceError, type SourceErrorCode } from '@/lib/sources/errors';
import { inngest } from './client';
import {
  QUIZ_REGENERATE_EVENT,
  SOURCE_DELETED_EVENT,
  quizRegenerateDataSchema,
} from './events';

const NON_RETRIABLE_CODES: ReadonlySet<SourceErrorCode> = new Set([
  'invalidInput',
  'notFound',
  'rightsRequired',
]);

function toStepError(error: unknown): Error {
  const code: SourceErrorCode = error instanceof SourceError ? error.code : 'generationUnavailable';
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

/** E5-01 AC6: one bounded AI call (one step) to prepare the next quiz version. */
export const regenerateQuiz = inngest.createFunction(
  {
    id: 'regenerate-quiz',
    triggers: [{ event: QUIZ_REGENERATE_EVENT }],
    retries: 2,
    concurrency: { limit: 1, key: 'event.data.moduleId' },
    cancelOn: [
      {
        event: SOURCE_DELETED_EVENT,
        if: 'async.data.sourceId == event.data.sourceId && async.data.userId == event.data.userId',
      },
    ],
  },
  async ({ event, step }) => {
    const parsed = quizRegenerateDataSchema.safeParse(event.data);
    if (!parsed.success) throw new NonRetriableError('invalidInput');
    const result = await step.run('regenerate-quiz', () =>
      runStep(() => regenerateQuizVersion(parsed.data)),
    );
    return {
      userId: parsed.data.userId,
      unbookId: parsed.data.unbookId,
      sourceId: parsed.data.sourceId,
      moduleId: parsed.data.moduleId,
      status: result.status,
      version: result.version,
      versionCount: result.versionCount,
    };
  },
);
