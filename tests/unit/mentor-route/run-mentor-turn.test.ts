import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getThreadContext: vi.fn(),
  assertRateLimit: vi.fn(),
  saveUserMessage: vi.fn(),
  recentTurns: vi.fn(),
  saveAssistantMessage: vi.fn(),
  deleteUserMessage: vi.fn(),
  reserveMentorMessage: vi.fn(),
  refundMentorMessage: vi.fn(),
  getMentorAllowance: vi.fn(),
  retrieveChunks: vi.fn(),
  streamChatTask: vi.fn(),
  loadPersona: vi.fn(),
  select: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/mentor/store', () => ({
  getThreadContext: mocks.getThreadContext,
  assertRateLimit: mocks.assertRateLimit,
  saveUserMessage: mocks.saveUserMessage,
  recentTurns: mocks.recentTurns,
  saveAssistantMessage: mocks.saveAssistantMessage,
  deleteUserMessage: mocks.deleteUserMessage,
}));
vi.mock('@/lib/billing/mentor-quota', () => ({
  reserveMentorMessage: mocks.reserveMentorMessage,
  refundMentorMessage: mocks.refundMentorMessage,
  getMentorAllowance: mocks.getMentorAllowance,
}));
vi.mock('@/lib/mentor/retrieval', () => ({ retrieveChunks: mocks.retrieveChunks }));
vi.mock('@/lib/ai/stream-chat', () => ({ streamChatTask: mocks.streamChatTask }));
vi.mock('@/lib/ai/personas', () => ({ loadPersona: mocks.loadPersona }));
vi.mock('@/db', () => ({ db: { select: mocks.select } }));

import { interests, profiles } from '@/db/schema';
import { MentorError } from '@/lib/mentor/errors';
import { createMentorEventReader, type MentorStreamEvent } from '@/lib/mentor/protocol';
import { runMentorTurn } from '@/lib/mentor/chat';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const UNBOOK_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_ID = '55555555-5555-4555-8555-555555555555';
const USER_MESSAGE_ID = '66666666-6666-4666-8666-666666666666';
const ASSISTANT_MESSAGE_ID = '77777777-7777-4777-8777-777777777777';
const CHUNK_ID = '88888888-8888-4888-8888-888888888888';

const ALLOWANCE = {
  limit: 20,
  used: 3,
  remaining: 17,
  period: '2026-11',
  resetsAt: new Date('2026-12-01T00:00:00.000Z'),
};

const CONTEXT = {
  threadId: THREAD_ID,
  unbookId: UNBOOK_ID,
  sourceId: SOURCE_ID,
  interestSlug: 'leadership-management',
  unbookTitle: 'Buku M7',
};

const CHUNKS = [
  {
    id: CHUNK_ID,
    idx: 0,
    text: 'Isi sumber tentang kepemimpinan.',
    pageFrom: 12,
    pageTo: 13,
    chapterTitle: 'Bab 1',
  },
];

type StreamEvent =
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      model: string;
      usedFallback: boolean;
      usage: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
      finish: 'stop' | 'length' | 'aborted';
    };

function streamOf(events: StreamEvent[]): void {
  mocks.streamChatTask.mockImplementation(async function* () {
    for (const event of events) yield event;
  });
}

function streamThrows(): void {
  mocks.streamChatTask.mockImplementation(async function* () {
    throw new Error('provider secret sk-live-123');
    yield { type: 'delta', text: '' };
  });
}

function done(finish: 'stop' | 'length' | 'aborted' = 'stop'): StreamEvent {
  return {
    type: 'done',
    model: 'test/model',
    usedFallback: false,
    usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.001 },
    finish,
  };
}

function makeRequest(options: {
  origin?: string | null;
  body?: unknown;
  signal?: AbortSignal;
} = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.origin !== null) headers.origin = options.origin ?? 'http://localhost:3000';
  const body = options.body === undefined ? { message: 'Apa intinya?' } : options.body;
  return new Request(`http://localhost:3000/api/mentor/${THREAD_ID}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: options.signal,
  });
}

async function readEvents(response: Response): Promise<MentorStreamEvent[]> {
  const reader = createMentorEventReader();
  return reader.push(await response.text());
}

function mockProfile(
  profile: { jobRole: string | null; goal: string | null; experienceLevel: string } | null = {
    jobRole: 'Manajer',
    goal: 'Memimpin tim',
    experienceLevel: 'intermediate',
  },
  interestName: string | null = 'Kepemimpinan',
): void {
  mocks.select.mockImplementation(() => {
    let table: unknown = null;
    const chain = {
      from(next: unknown) {
        table = next;
        return chain;
      },
      where() {
        return chain;
      },
      limit() {
        if (table === profiles) return Promise.resolve(profile ? [profile] : []);
        if (table === interests) return Promise.resolve(interestName ? [{ name: interestName }] : []);
        return Promise.resolve([]);
      },
    };
    return chain;
  });
}

function defaultMocks(): void {
  mocks.getCurrentUser.mockResolvedValue({ id: USER_ID });
  mocks.getThreadContext.mockResolvedValue(CONTEXT);
  mocks.assertRateLimit.mockResolvedValue({ remaining: 29 });
  mocks.saveUserMessage.mockResolvedValue({
    id: USER_MESSAGE_ID,
    role: 'user',
    content: 'Apa intinya?',
    citations: null,
    inputTokens: null,
    outputTokens: null,
    createdAt: new Date(),
  });
  mocks.recentTurns.mockResolvedValue([]);
  mocks.saveAssistantMessage.mockResolvedValue({
    id: ASSISTANT_MESSAGE_ID,
    role: 'assistant',
    content: 'Jawaban',
    citations: [],
    inputTokens: 10,
    outputTokens: 20,
    createdAt: new Date(),
  });
  mocks.deleteUserMessage.mockResolvedValue({ deleted: true });
  mocks.reserveMentorMessage.mockResolvedValue({
    reservation: { period: ALLOWANCE.period },
    allowance: ALLOWANCE,
  });
  mocks.refundMentorMessage.mockResolvedValue({ period: ALLOWANCE.period, used: 2 });
  mocks.getMentorAllowance.mockResolvedValue({
    ...ALLOWANCE,
    used: 2,
    remaining: 18,
  });
  mocks.retrieveChunks.mockResolvedValue({ chunks: CHUNKS, mode: 'hybrid' });
  mocks.loadPersona.mockResolvedValue({
    slug: 'leadership-management',
    name: 'Mentor Kepemimpinan',
    content: 'Persona.',
  });
  mockProfile();
  streamOf([{ type: 'delta', text: 'Jawaban dari sumber [[1]].' }, done()]);
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultMocks();
});

describe('POST /api/mentor/[threadId] pre-stream rejection', () => {
  it('rejects a wrong Origin with 403 before reading the session or body', async () => {
    const response = await runMentorTurn(makeRequest({ origin: 'https://evil.example' }), THREAD_ID);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'invalidInput', allowance: null });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.getThreadContext).not.toHaveBeenCalled();
    expect(mocks.reserveMentorMessage).not.toHaveBeenCalled();
    expect(mocks.streamChatTask).not.toHaveBeenCalled();
  });

  it('rejects a missing Origin with 403', async () => {
    const response = await runMentorTurn(makeRequest({ origin: null }), THREAD_ID);
    expect(response.status).toBe(403);
  });

  it('accepts an Origin matching NEXT_PUBLIC_APP_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.unbookin.com');
    const response = await runMentorTurn(
      makeRequest({ origin: 'https://app.unbookin.com' }),
      THREAD_ID,
    );
    vi.unstubAllEnvs();

    expect(response.status).toBe(200);
    expect(mocks.getCurrentUser).toHaveBeenCalledOnce();
  });

  it('answers 401 notFound when there is no session and changes nothing', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await runMentorTurn(makeRequest(), THREAD_ID);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'notFound', allowance: null });
    expect(mocks.saveUserMessage).not.toHaveBeenCalled();
    expect(mocks.reserveMentorMessage).not.toHaveBeenCalled();
    expect(mocks.streamChatTask).not.toHaveBeenCalled();
  });

  it('answers 400 invalidInput for a malformed JSON body', async () => {
    const response = await runMentorTurn(makeRequest({ body: '{nope' }), THREAD_ID);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: 'invalidInput', allowance: null });
    expect(mocks.getThreadContext).not.toHaveBeenCalled();
    expect(mocks.reserveMentorMessage).not.toHaveBeenCalled();
  });

  it('answers 400 invalidInput for an empty or too long question', async () => {
    const empty = await runMentorTurn(makeRequest({ body: { message: '   ' } }), THREAD_ID);
    const extra = await runMentorTurn(
      makeRequest({ body: { message: 'x'.repeat(2_001) } }),
      THREAD_ID,
    );

    expect(empty.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(mocks.getThreadContext).not.toHaveBeenCalled();
  });

  it("answers 404 for another user's thread without touching quota or AI", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: OTHER_USER_ID });
    mocks.getThreadContext.mockRejectedValue(new MentorError('notFound'));

    const response = await runMentorTurn(makeRequest(), THREAD_ID);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ code: 'notFound', allowance: null });
    expect(mocks.getThreadContext).toHaveBeenCalledWith({ userId: OTHER_USER_ID }, THREAD_ID);
    expect(mocks.reserveMentorMessage).not.toHaveBeenCalled();
    expect(mocks.streamChatTask).not.toHaveBeenCalled();
  });

  it('answers 409 sourceUnavailable for a thread without a source', async () => {
    mocks.getThreadContext.mockRejectedValue(new MentorError('sourceUnavailable'));
    const response = await runMentorTurn(makeRequest(), THREAD_ID);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'sourceUnavailable',
      allowance: null,
    });
  });

  it('answers 429 rateLimited without reserving quota or calling AI', async () => {
    mocks.assertRateLimit.mockRejectedValue(new MentorError('rateLimited'));
    const response = await runMentorTurn(makeRequest(), THREAD_ID);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ code: 'rateLimited', allowance: null });
    expect(mocks.reserveMentorMessage).not.toHaveBeenCalled();
    expect(mocks.saveUserMessage).not.toHaveBeenCalled();
    expect(mocks.streamChatTask).not.toHaveBeenCalled();
  });

  it('answers 402 quotaExceeded with the current allowance and no AI call', async () => {
    mocks.reserveMentorMessage.mockRejectedValue(new MentorError('quotaExceeded'));
    const response = await runMentorTurn(makeRequest(), THREAD_ID);

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      code: 'quotaExceeded',
      allowance: {
        limit: 20,
        used: 2,
        remaining: 18,
        resetsAt: '2026-12-01T00:00:00.000Z',
      },
    });
    expect(mocks.saveUserMessage).not.toHaveBeenCalled();
    expect(mocks.streamChatTask).not.toHaveBeenCalled();
  });
});

function historySection(messages: { role: string; content: string }[]): string {
  const user = messages.find((message) => message.role === 'user')?.content ?? '';
  const start = user.indexOf('Riwayat percakapan terakhir');
  const end = user.indexOf('\n\n', start);
  return end === -1 ? user.slice(start) : user.slice(start, end);
}

describe('POST /api/mentor/[threadId] turn', () => {
  it('streams started → segments → done and saves the cited answer', async () => {
    mocks.recentTurns.mockResolvedValue([
      { id: 'older-user', role: 'user', content: 'RIWAYAT-LAMA', citations: null },
      { id: 'older-answer', role: 'assistant', content: 'JAWABAN-LAMA', citations: [] },
      {
        id: USER_MESSAGE_ID,
        role: 'user',
        content: 'PERTANYAAN-SEKARANG',
        citations: null,
      },
    ]);
    const request = makeRequest();
    const response = await runMentorTurn(request, THREAD_ID);
    const events = await readEvents(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');

    expect(events.map((event) => event.type)).toEqual([
      'started',
      'segment',
      'segment',
      'segment',
      'done',
    ]);
    expect(events[0]).toEqual({
      type: 'started',
      userMessageId: USER_MESSAGE_ID,
      allowance: {
        limit: 20,
        used: 3,
        remaining: 17,
        resetsAt: '2026-12-01T00:00:00.000Z',
      },
    });
    expect(events[2]).toEqual({
      type: 'segment',
      segment: { type: 'citation', n: 1, chunkId: CHUNK_ID, page: 12 },
    });
    expect(events.at(-1)).toEqual({
      type: 'done',
      messageId: ASSISTANT_MESSAGE_ID,
      finish: 'stop',
      allowance: {
        limit: 20,
        used: 3,
        remaining: 17,
        resetsAt: '2026-12-01T00:00:00.000Z',
      },
    });

    expect(mocks.reserveMentorMessage).toHaveBeenCalledWith(USER_ID);
    expect(mocks.reserveMentorMessage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveUserMessage.mock.invocationCallOrder[0]!,
    );
    expect(mocks.saveUserMessage).toHaveBeenCalledWith(
      { userId: USER_ID },
      THREAD_ID,
      'Apa intinya?',
    );
    expect(mocks.saveAssistantMessage).toHaveBeenCalledWith(
      { userId: USER_ID },
      THREAD_ID,
      {
        content: 'Jawaban dari sumber [[1]].',
        citations: [{ chunkId: CHUNK_ID, page: 12 }],
        inputTokens: 10,
        outputTokens: 20,
      },
    );
    expect(mocks.retrieveChunks).toHaveBeenCalledWith({
      sourceId: SOURCE_ID,
      question: 'Apa intinya?',
      userId: USER_ID,
    });
    expect(mocks.recentTurns).toHaveBeenCalledWith({ userId: USER_ID }, THREAD_ID, 7);

    const call = mocks.streamChatTask.mock.calls[0]?.[0] as {
      task: string;
      promptVersion: string;
      signal: AbortSignal;
      messages: { role: string; content: string }[];
    };
    expect(call.task).toBe('mentor_chat');
    expect(call.promptVersion).toBe('mentor_chat@1');
    expect(call.signal).toBe(request.signal);
    expect(historySection(call.messages)).toContain('RIWAYAT-LAMA');
    expect(historySection(call.messages)).not.toContain('PERTANYAAN-SEKARANG');
  });

  it('splits citation and outside markers across deltas without emitting them raw', async () => {
    mocks.retrieveChunks.mockResolvedValue({ chunks: CHUNKS, mode: 'hybrid' });
    streamOf([
      { type: 'delta', text: 'Lihat [[' },
      { type: 'delta', text: '1]] lalu <' },
      { type: 'delta', text: '<luar-sumber>>halo<' },
      { type: 'delta', text: '/luar-sumber>> akhir' },
      done(),
    ]);
    const response = await runMentorTurn(makeRequest(), THREAD_ID);
    const text = await response.text();
    const events = createMentorEventReader().push(text);

    expect(text).not.toContain('[[1]]');
    expect(text).not.toContain('<<luar-sumber>>');
    expect(text).not.toContain('<</luar-sumber>>');
    expect(events.some((event) => event.type === 'segment' && event.segment.type === 'citation')).toBe(
      true,
    );
    expect(
      events.some((event) => event.type === 'segment' && event.segment.type === 'outside-start'),
    ).toBe(true);
    expect(
      events.some((event) => event.type === 'segment' && event.segment.type === 'outside-end'),
    ).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });
});

describe('POST /api/mentor/[threadId] failure and stop rules', () => {
  it('refunds once and deletes the question when the provider fails before text', async () => {
    streamThrows();
    const response = await runMentorTurn(makeRequest(), THREAD_ID);
    const events = await readEvents(response);

    expect(events[0]?.type).toBe('started');
    expect(events.at(-1)).toEqual({
      type: 'error',
      code: 'failed',
      refunded: true,
      allowance: {
        limit: 20,
        used: 2,
        remaining: 18,
        resetsAt: '2026-12-01T00:00:00.000Z',
      },
    });
    expect(mocks.deleteUserMessage).toHaveBeenCalledWith({ userId: USER_ID }, USER_MESSAGE_ID);
    expect(mocks.refundMentorMessage).toHaveBeenCalledOnce();
    expect(mocks.refundMentorMessage).toHaveBeenCalledWith(USER_ID, {
      period: ALLOWANCE.period,
    });
    expect(mocks.saveAssistantMessage).not.toHaveBeenCalled();
  });

  it('treats an empty answer as a failure before text', async () => {
    streamOf([done()]);
    const response = await runMentorTurn(makeRequest(), THREAD_ID);
    const events = await readEvents(response);

    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'failed', refunded: true });
    expect(mocks.deleteUserMessage).toHaveBeenCalledOnce();
    expect(mocks.refundMentorMessage).toHaveBeenCalledOnce();
    expect(mocks.saveAssistantMessage).not.toHaveBeenCalled();
  });

  it('refunds and deletes when the user stops before any text', async () => {
    streamOf([done('aborted')]);
    const response = await runMentorTurn(makeRequest(), THREAD_ID);
    const events = await readEvents(response);

    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'failed', refunded: true });
    expect(mocks.deleteUserMessage).toHaveBeenCalledOnce();
    expect(mocks.refundMentorMessage).toHaveBeenCalledOnce();
  });

  it('keeps the partial answer and does not refund when the provider fails after text', async () => {
    mocks.streamChatTask.mockImplementation(async function* () {
      yield { type: 'delta', text: 'Sebagian jawaban [[1]]' };
      throw new Error('provider failed');
    });
    const response = await runMentorTurn(makeRequest(), THREAD_ID);
    const events = await readEvents(response);

    expect(events.at(-1)).toEqual({
      type: 'error',
      code: 'failed',
      refunded: false,
      allowance: {
        limit: 20,
        used: 3,
        remaining: 17,
        resetsAt: '2026-12-01T00:00:00.000Z',
      },
    });
    expect(mocks.saveAssistantMessage).toHaveBeenCalledOnce();
    expect(mocks.saveAssistantMessage.mock.calls[0]?.[2]).toMatchObject({
      content: 'Sebagian jawaban [[1]]',
      citations: [{ chunkId: CHUNK_ID, page: 12 }],
    });
    expect(mocks.deleteUserMessage).not.toHaveBeenCalled();
    expect(mocks.refundMentorMessage).not.toHaveBeenCalled();
  });

  it('saves the partial answer and reports finish aborted after a user stop', async () => {
    streamOf([{ type: 'delta', text: 'Jawaban terpotong' }, done('aborted')]);
    const response = await runMentorTurn(makeRequest(), THREAD_ID);
    const events = await readEvents(response);

    expect(events.at(-1)).toEqual({
      type: 'done',
      messageId: ASSISTANT_MESSAGE_ID,
      finish: 'aborted',
      allowance: {
        limit: 20,
        used: 3,
        remaining: 17,
        resetsAt: '2026-12-01T00:00:00.000Z',
      },
    });
    expect(mocks.saveAssistantMessage).toHaveBeenCalledOnce();
    expect(mocks.deleteUserMessage).not.toHaveBeenCalled();
    expect(mocks.refundMentorMessage).not.toHaveBeenCalled();
  });

  it('refunds and deletes exactly once when saving the user message fails', async () => {
    mocks.saveUserMessage.mockRejectedValue(new Error('db down'));
    const response = await runMentorTurn(makeRequest(), THREAD_ID);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: 'failed',
      allowance: {
        limit: 20,
        used: 2,
        remaining: 18,
        resetsAt: '2026-12-01T00:00:00.000Z',
      },
    });
    expect(mocks.refundMentorMessage).toHaveBeenCalledOnce();
    expect(mocks.deleteUserMessage).not.toHaveBeenCalled();
    expect(mocks.streamChatTask).not.toHaveBeenCalled();
  });

  it('never leaks vendor errors or Authorization material in an error body', async () => {
    mocks.getThreadContext.mockRejectedValue(new Error('Bearer sk-live-secret'));
    const response = await runMentorTurn(makeRequest(), THREAD_ID);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get('Authorization')).toBeNull();
    expect(body).toBe(JSON.stringify({ code: 'failed', allowance: null }));
  });
});
