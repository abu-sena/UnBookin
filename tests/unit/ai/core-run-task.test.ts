import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  fetch: vi.fn(),
  recordedValues: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({
  db: { select: mocks.select, insert: mocks.insert },
}));

import {
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_BATCH_SIZE,
  resetEmbeddingConfigCache,
  runTask,
} from '@/lib/ai/run-task';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SENTINEL_TEXT = 'SENTINEL_RAW_SOURCE_TEXT';

function configRow(model = 'founder/embedding-model') {
  return [{ model }];
}

function vector(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i + seed) / 1000);
}

function embeddingsResponse(data: unknown, usage: unknown = undefined) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data, usage }),
  };
}

beforeEach(() => {
  resetEmbeddingConfigCache();
  vi.stubEnv('OPENROUTER_API_KEY', 'platform-key');
  vi.stubEnv('OPENROUTER_BASE_URL', 'https://gateway.local/api/v1');
  vi.stubEnv('EMBEDDING_MODEL', 'env-shortcut-that-must-be-ignored');
  mocks.recordedValues.length = 0;
  mocks.select.mockClear();
  mocks.insert.mockClear();
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => configRow(),
      }),
    }),
  }));
  mocks.insert.mockImplementation(() => ({
    values: (values: unknown) => {
      mocks.recordedValues.push(values);
      return Promise.resolve();
    },
  }));
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue(
    embeddingsResponse([{ index: 0, embedding: vector(1) }], {
      prompt_tokens: 12,
      total_tokens: 24,
      cost: 0.0002,
    }),
  );
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('runTask(embedding)', () => {
  it('requires an active ai_task_configs row and never uses an env shortcut', async () => {
    mocks.select.mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      runTask('embedding', { texts: ['halo'] }, { userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'configurationMissing' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('sanitizes a config-lookup driver error into a safe SourceError', async () => {
    mocks.select.mockImplementation(
      () =>
        ({
          from: () => ({
            where: () => ({
              limit: async () => {
                throw new Error('db-secret: connection refused via driver pq://internal');
              },
            }),
          }),
        }) as never,
    );

    const error = await runTask('embedding', { texts: ['halo'] }, { userId: USER_ID }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ code: 'embeddingUnavailable' });
    expect((error as Error).message).toBe('embeddingUnavailable');
    expect(JSON.stringify(error)).not.toContain('db-secret');
    // The failure happened before any provider call or usage logging.
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('requires the platform key without reading any model from env', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', undefined);

    await expect(
      runTask('embedding', { texts: ['halo'] }, { userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'configurationMissing' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('sends the configured model from the database with bounded size and headers', async () => {
    mocks.fetch.mockResolvedValue(
      embeddingsResponse(
        [
          { index: 0, embedding: vector(1) },
          { index: 1, embedding: vector(2) },
        ],
        { prompt_tokens: 12, total_tokens: 24, cost: 0.0002 },
      ),
    );

    const result = await runTask(
      'embedding',
      { texts: [SENTINEL_TEXT, 'teks kedua'] },
      { userId: USER_ID },
    );

    expect(result.embeddings).toHaveLength(2);
    expect(result.costUsd).toBeCloseTo(0.0002);

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gateway.local/api/v1/embeddings');
    const headers = init.headers as Record<string, string>;
    expect(headers['HTTP-Referer']).toBe('https://unbookin.com');
    expect(headers['X-Title']).toBe('Unbookin');
    expect(headers.Authorization).toBe('Bearer platform-key');

    const body = JSON.parse(String(init.body)) as {
      model: string;
      input: string[];
      dimensions: number;
    };
    expect(body.model).toBe('founder/embedding-model');
    expect(body.input).toEqual([SENTINEL_TEXT, 'teks kedua']);
    expect(body.dimensions).toBe(1536);
  });

  it('rejects batches above the bounded size without any request', async () => {
    const texts = Array.from({ length: MAX_EMBEDDING_BATCH_SIZE + 1 }, () => 'teks');

    await expect(runTask('embedding', { texts }, { userId: USER_ID })).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('reorders vectors to input order using the returned indexes', async () => {
    mocks.fetch.mockResolvedValue(
      embeddingsResponse([
        { index: 1, embedding: vector(2) },
        { index: 0, embedding: vector(1) },
      ]),
    );

    const result = await runTask('embedding', { texts: ['a', 'b'] }, { userId: USER_ID });

    expect(result.embeddings[0]?.[0]).toBeCloseTo(vector(1)[0] ?? 0);
    expect(result.embeddings[1]?.[0]).toBeCloseTo(vector(2)[0] ?? 0);
  });

  it('fails safely on wrong vector shapes: count, dimensions, duplicates, non-finite', async () => {
    mocks.fetch.mockResolvedValue(embeddingsResponse([{ index: 0, embedding: vector(1) }]));
    await expect(
      runTask('embedding', { texts: ['a', 'b'] }, { userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'embeddingUnavailable' });

    mocks.fetch.mockResolvedValue(
      embeddingsResponse([{ index: 0, embedding: vector(1).slice(0, 100) }]),
    );
    await expect(runTask('embedding', { texts: ['a'] }, { userId: USER_ID })).rejects.toMatchObject(
      { code: 'embeddingUnavailable' },
    );

    mocks.fetch.mockResolvedValue(
      embeddingsResponse([
        { index: 0, embedding: vector(1) },
        { index: 0, embedding: vector(2) },
      ]),
    );
    await expect(
      runTask('embedding', { texts: ['a', 'b'] }, { userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'embeddingUnavailable' });

    const nonFinite = vector(1);
    nonFinite[5] = Number.NaN;
    mocks.fetch.mockResolvedValue(embeddingsResponse([{ index: 0, embedding: nonFinite }]));
    await expect(runTask('embedding', { texts: ['a'] }, { userId: USER_ID })).rejects.toMatchObject(
      { code: 'embeddingUnavailable' },
    );
    expect(mocks.insert).toHaveBeenCalledTimes(4);
  });

  it('returns null cost when the provider omits usage cost', async () => {
    mocks.fetch.mockResolvedValue(
      embeddingsResponse([{ index: 0, embedding: vector(1) }], { prompt_tokens: 5 }),
    );

    const result = await runTask('embedding', { texts: ['a'] }, { userId: USER_ID });

    expect(result.costUsd).toBeNull();
    const logValues = mocks.recordedValues.at(-1) as Record<string, unknown>;
    expect(logValues.costUsd).toBeNull();
  });

  it('maps HTTP failures to a safe code and logs only safe metadata', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    await expect(runTask('embedding', { texts: ['a'] }, { userId: USER_ID })).rejects.toMatchObject(
      { code: 'embeddingUnavailable' },
    );

    const logValues = mocks.recordedValues.at(-1) as Record<string, unknown>;
    expect(logValues.status).toBe('failed');
    expect(logValues.error).toBe('embeddingUnavailable');
    expect(JSON.stringify(logValues)).not.toContain('platform-key');
    expect(JSON.stringify(logValues)).not.toContain(SENTINEL_TEXT);
  });

  it('maps transport/timeout failures to a safe code without leaking detail', async () => {
    mocks.fetch.mockRejectedValue(new DOMException('The operation timed out.', 'AbortError'));

    await expect(
      runTask('embedding', { texts: [SENTINEL_TEXT] }, { userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'embeddingUnavailable' });

    const logValues = mocks.recordedValues.at(-1) as Record<string, unknown>;
    expect(logValues.status).toBe('failed');
    expect(JSON.stringify(logValues)).not.toContain(SENTINEL_TEXT);
    expect(JSON.stringify(logValues)).not.toContain('platform-key');
  });

  it('caches a successful config lookup for subsequent calls', async () => {
    await runTask('embedding', { texts: ['a'] }, { userId: USER_ID });
    await runTask('embedding', { texts: ['b'] }, { userId: USER_ID });

    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('logs success metadata without input text or key material', async () => {
    await runTask('embedding', { texts: [SENTINEL_TEXT] }, { userId: USER_ID });

    const logValues = mocks.recordedValues.at(-1) as Record<string, unknown>;
    expect(logValues).toMatchObject({
      userId: USER_ID,
      task: 'embedding',
      model: 'founder/embedding-model',
      byok: false,
      status: 'succeeded',
      inputTokens: 12,
      outputTokens: 0,
      error: null,
    });
    expect(JSON.stringify(logValues)).not.toContain(SENTINEL_TEXT);
    expect(JSON.stringify(logValues)).not.toContain('platform-key');
  });

  it('never records total_tokens as output tokens (no double counting)', async () => {
    mocks.fetch.mockResolvedValue(
      embeddingsResponse([{ index: 0, embedding: vector(1) }], {
        prompt_tokens: 12,
        total_tokens: 24,
        cost: 0.0002,
      }),
    );

    const result = await runTask('embedding', { texts: ['a'] }, { userId: USER_ID });

    const logValues = mocks.recordedValues.at(-1) as Record<string, unknown>;
    expect(logValues.inputTokens).toBe(12);
    // Embeddings have NO output tokens; total_tokens covers the whole request.
    expect(logValues.outputTokens).toBe(0);
    expect(result.costUsd).toBeCloseTo(0.0002);
  });

  it('records null usage when the provider omits it entirely', async () => {
    mocks.fetch.mockResolvedValue(embeddingsResponse([{ index: 0, embedding: vector(1) }]));

    const result = await runTask('embedding', { texts: ['a'] }, { userId: USER_ID });

    const logValues = mocks.recordedValues.at(-1) as Record<string, unknown>;
    expect(logValues.inputTokens).toBeNull();
    expect(logValues.outputTokens).toBeNull();
    expect(logValues.costUsd).toBeNull();
    expect(result.costUsd).toBeNull();
  });

  it('rejects invalid usage metadata instead of writing malformed rows', async () => {
    mocks.fetch.mockResolvedValue(
      embeddingsResponse([{ index: 0, embedding: vector(1) }], {
        prompt_tokens: -5,
        total_tokens: 1.5,
        cost: Number.POSITIVE_INFINITY,
      }),
    );

    await runTask('embedding', { texts: ['a'] }, { userId: USER_ID });

    let logValues = mocks.recordedValues.at(-1) as Record<string, unknown>;
    expect(logValues.status).toBe('succeeded');
    expect(logValues.inputTokens).toBeNull();
    expect(logValues.costUsd).toBeNull();

    // Malicious cost beyond the numeric(12,6) column range is dropped too.
    mocks.fetch.mockResolvedValue(
      embeddingsResponse([{ index: 0, embedding: vector(1) }], {
        prompt_tokens: 10,
        cost: 12345678.5,
      }),
    );
    await runTask('embedding', { texts: ['b'] }, { userId: USER_ID });

    logValues = mocks.recordedValues.at(-1) as Record<string, unknown>;
    expect(logValues.inputTokens).toBe(10);
    expect(logValues.outputTokens).toBe(0);
    expect(logValues.costUsd).toBeNull();
  });
});
