import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  fetch: vi.fn(),
  getTaskConfig: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: { insert: mocks.insert } }));
vi.mock('@/lib/ai/task-config', () => ({ getTaskConfig: mocks.getTaskConfig }));
import { MAX_STREAM_BYTES, streamChatTask, type StreamChatEvent } from '@/lib/ai/stream-chat';

const config = {
  model: 'configured-primary',
  fallbackModel: 'configured-fallback',
  temperature: 0.4,
  maxOutputTokens: 1024,
};
const userId = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const request = {
  task: 'mentor_chat',
  messages: [{ role: 'user' as const, content: 'PRIVATE_QUESTION_SENTINEL' }],
  userId,
  promptVersion: 'mentor_chat@1',
};

function data(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function delta(text: string): string {
  return data({ choices: [{ delta: { content: text }, finish_reason: null }] });
}

const finalChunk = data({
  choices: [{ delta: {}, finish_reason: 'stop' }],
  usage: { prompt_tokens: 11, completion_tokens: 7, cost: 0.002 },
});

function responseFromBytes(slices: Uint8Array[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const slice of slices) controller.enqueue(slice);
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function sse(slices: Uint8Array[], at: number[] = []): Response {
  const encoded = new TextEncoder().encode(
    delta('Halo ') + delta('é 😀') + finalChunk + 'data: [DONE]\n\n',
  );
  const parts: Uint8Array[] = [];
  let start = 0;
  for (const index of at) {
    parts.push(encoded.slice(start, index));
    start = index;
  }
  parts.push(encoded.slice(start));
  if (slices.length > 0) parts.push(...slices);
  return responseFromBytes(parts);
}

async function collect(events: AsyncGenerator<StreamChatEvent>): Promise<StreamChatEvent[]> {
  const collected: StreamChatEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'platform-test-key');
  vi.stubEnv('OPENROUTER_BASE_URL', 'https://gateway.local/api/v1');
  mocks.getTaskConfig.mockReset().mockResolvedValue(config);
  mocks.values.mockReset().mockResolvedValue(undefined);
  mocks.insert.mockReset().mockImplementation(() => ({ values: mocks.values }));
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('streamChatTask', () => {
  it('parses SSE split at arbitrary bytes and logs metadata without content', async () => {
    const encoded = new TextEncoder().encode(
      delta('Halo ') + delta('é 😀') + finalChunk + 'data: [DONE]\n\n',
    );
    const cuts = [1, 7, 8, Math.floor(encoded.length / 2), encoded.length - 3];
    mocks.fetch.mockResolvedValue(sse([], cuts));

    const events = await collect(streamChatTask(request));
    const deltas = events.filter((event) => event.type === 'delta');
    expect(deltas.map((event) => (event.type === 'delta' ? event.text : '')).join('')).toBe(
      'Halo é 😀',
    );
    expect(events.at(-1)).toEqual({
      type: 'done',
      model: config.model,
      usedFallback: false,
      usage: { inputTokens: 11, outputTokens: 7, costUsd: 0.002 },
      finish: 'stop',
    });

    const init = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe('https://gateway.local/api/v1/chat/completions');
    expect(init).toMatchObject({
      cache: 'no-store',
      method: 'POST',
      headers: {
        Authorization: 'Bearer platform-test-key',
        'HTTP-Referer': 'https://unbookin.com',
        'X-Title': 'Unbookin',
      },
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: config.model,
      temperature: 0.4,
      max_tokens: 1024,
      stream: true,
      usage: { include: true },
    });

    expect(mocks.values).toHaveBeenCalledTimes(1);
    const row = mocks.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      task: 'mentor_chat',
      model: config.model,
      status: 'succeeded',
      promptVersion: 'mentor_chat@1',
      inputTokens: 11,
      outputTokens: 7,
    });
    expect(JSON.stringify(row)).not.toContain('PRIVATE_QUESTION_SENTINEL');
    expect(JSON.stringify(row)).not.toContain('Halo');
  });

  it('falls back only when the primary fails before the first token', async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(sse([]));

    const events = await collect(streamChatTask(request));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      model: config.fallbackModel,
      usedFallback: true,
    });
    expect(mocks.values.mock.calls.map(([row]) => (row as { status: string }).status)).toEqual([
      'failed',
      'succeeded',
    ]);
  });

  it('surfaces an in-stream error and does not fall back after a token', async () => {
    const body = new TextEncoder().encode(
      delta('Halo') + data({ error: { message: 'PRIVATE_VENDOR_TEXT' } }) + 'data: [DONE]\n\n',
    );
    mocks.fetch.mockResolvedValue(responseFromBytes([body]));

    await expect(collect(streamChatTask(request))).rejects.toMatchObject({
      code: 'generationUnavailable',
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.values).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.values.mock.calls[0]?.[0])).not.toContain('PRIVATE_VENDOR_TEXT');
  });

  it('caps the number of streamed bytes', async () => {
    mocks.fetch.mockResolvedValue(
      responseFromBytes([new Uint8Array(MAX_STREAM_BYTES + 1).fill(97)]),
    );
    await expect(collect(streamChatTask(request))).rejects.toMatchObject({
      code: 'generationUnavailable',
    });
  });

  it('yields an aborted finish when the caller aborts mid-stream', async () => {
    const controller = new AbortController();
    const first = new TextEncoder().encode(delta('Halo'));
    mocks.fetch.mockImplementation(async (_url, init?: RequestInit) => {
      const signal = init?.signal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(streamController) {
            streamController.enqueue(first);
            const fail = () => {
              try {
                streamController.error(new DOMException('Aborted', 'AbortError'));
              } catch {
                // Already closed/errored.
              }
            };
            signal?.addEventListener('abort', fail, { once: true });
          },
        }),
        { status: 200 },
      );
    });

    const events: StreamChatEvent[] = [];
    for await (const event of streamChatTask({ ...request, signal: controller.signal })) {
      events.push(event);
      if (event.type === 'delta') controller.abort();
    }
    expect(events.at(-1)).toMatchObject({ type: 'done', finish: 'aborted' });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect((mocks.values.mock.calls[0]?.[0] as { status: string }).status).toBe('aborted');
  });
});
