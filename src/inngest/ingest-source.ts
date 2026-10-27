import 'server-only';
import { NonRetriableError } from 'inngest';
import {
  canSendIngestHandoff,
  embedSourceBatch,
  extractAndPersistSource,
  failSourceIngest,
  finishSourceIngest,
  type IngestIdentity,
} from '@/lib/sources/ingest-store';
import { SourceError, isSourceErrorCode, type SourceErrorCode } from '@/lib/sources/errors';
import { inngest } from './client';
import {
  SOURCE_DELETED_EVENT,
  SOURCE_UPLOADED_EVENT,
  UNBOOK_REQUESTED_EVENT,
  sourceUploadedDataSchema,
} from './events';

const EMBED_BATCH_SIZE = 16;

const NON_RETRIABLE_CODES: ReadonlySet<SourceErrorCode> = new Set([
  'invalidInput',
  'invalidUrl',
  'noText',
  'fileType',
  'fileTooLarge',
  'pagesExceeded',
  'quotaExceeded',
  'rightsRequired',
  'configurationMissing',
]);

type IngestSourceResult = {
  sourceId: string;
  userId: string;
  unbookId: string;
  alreadyIngested: boolean;
  totalChunks: number;
  embeddedChunks: number;
  ingested: boolean;
  handoffSent: boolean;
};

function inactiveResult(ids: IngestIdentity): IngestSourceResult {
  return {
    sourceId: ids.sourceId,
    userId: ids.userId,
    unbookId: ids.unbookId,
    alreadyIngested: false,
    totalChunks: 0,
    embeddedChunks: 0,
    ingested: false,
    handoffSent: false,
  };
}

function toStepError(error: unknown): Error {
  const code: SourceErrorCode = error instanceof SourceError ? error.code : 'processingFailed';
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

export const ingestSource = inngest.createFunction(
  {
    id: 'ingest-source',
    triggers: [{ event: SOURCE_UPLOADED_EVENT }],
    retries: 2,
    concurrency: { limit: 1, key: 'event.data.sourceId' },
    cancelOn: [
      {
        event: SOURCE_DELETED_EVENT,
        if: 'async.data.sourceId == event.data.sourceId && async.data.userId == event.data.userId',
      },
    ],
    onFailure: async ({ event, step }) => {
      const dto: unknown = event.data.event.data;
      const parsed = sourceUploadedDataSchema.safeParse(dto);
      if (!parsed.success) return { handled: false as const };
      const message = event.data.error?.message;
      const code: SourceErrorCode = isSourceErrorCode(message) ? message : 'processingFailed';
      // Mark the ingest failed INSIDE a durable step; a transient DB outage
      // must fail this step (so Inngest retries the failure handler) instead
      // of being swallowed into `marked: false` and leaving the job queued.
      const marked = await step.run('fail-ingest', () =>
        runStep(async () => {
          await failSourceIngest(parsed.data, code);
          return true;
        }),
      );
      return {
        sourceId: parsed.data.sourceId,
        userId: parsed.data.userId,
        unbookId: parsed.data.unbookId,
        code,
        marked,
      };
    },
  },
  async ({ event, step }) => {
    const parsed = sourceUploadedDataSchema.safeParse(event.data);
    if (!parsed.success) throw new NonRetriableError('invalidInput');
    const ids: IngestIdentity = parsed.data;

    const extract = await step.run('extract-source', () =>
      runStep(() => extractAndPersistSource(ids)),
    );
    if (!extract.active) return inactiveResult(ids);

    const alreadyIngested = extract.alreadyIngested;
    let totalChunks = extract.totalChunks;
    let embeddedChunks = 0;

    if (!alreadyIngested) {
      for (let startIdx = 0; startIdx < totalChunks; startIdx += EMBED_BATCH_SIZE) {
        const batch = { startIdx, limit: Math.min(EMBED_BATCH_SIZE, totalChunks - startIdx) };
        const embed = await step.run(`embed-${batch.startIdx}`, () =>
          runStep(() => embedSourceBatch(ids, batch)),
        );
        if (!embed.active) return { ...inactiveResult(ids), totalChunks, embeddedChunks };
        embeddedChunks += embed.embeddedChunks;
        totalChunks = embed.totalChunks;
      }
    }

    const finish = await step.run('finish-ingest', () => runStep(() => finishSourceIngest(ids)));
    if (!finish.ingested) return { ...inactiveResult(ids), totalChunks, embeddedChunks };

    const canHandoff = await step.run('check-handoff', () =>
      runStep(() => canSendIngestHandoff(ids)),
    );
    let handoffSent = false;
    if (canHandoff) {
      await step.sendEvent('request-unbook', {
        id: `unbook-requested:${ids.sourceId}:${ids.unbookId}`,
        name: UNBOOK_REQUESTED_EVENT,
        data: ids,
      });
      handoffSent = true;
    }

    return {
      sourceId: ids.sourceId,
      userId: ids.userId,
      unbookId: ids.unbookId,
      alreadyIngested,
      totalChunks,
      embeddedChunks,
      ingested: true,
      handoffSent,
    };
  },
);
