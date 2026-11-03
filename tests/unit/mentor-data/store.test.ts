import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', async () => {
  const { fake } = await import('../learning/fake-db');
  return { db: fake.db };
});

import {
  assertRateLimit,
  deleteUserMessage,
  getOrCreateThread,
  getThreadContext,
  listMessages,
  recentTurns,
  saveAssistantMessage,
  saveUserMessage,
} from '@/lib/mentor/store';
import { mentorMessages } from '@/db/schema';
import { fake } from '../learning/fake-db';

const USER = { userId: '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f' };
const THREAD_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const UNBOOK_ID = 'c3d4e5f6-7b8c-4d9e-af0f-2a3b4c5d6e7f';
const MESSAGE_ID = 'd4e5f6a7-8c9d-4eaf-b01f-3b4c5d6e7f8a';
const OTHER_ID = 'e5f6a7b8-9d0e-4fb0-c21a-4c5d6e7f8a9b';

beforeEach(() => fake.reset());

describe('identity and ownership', () => {
  it('rejects a malformed identity before any query', async () => {
    await expect(getOrCreateThread({ userId: 'forged' }, UNBOOK_ID)).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(fake.recorded.transactionCount).toBe(0);
  });

  it('rejects a foreign or non-ready Unbook when creating a thread', async () => {
    fake.results.push([]);
    await expect(getOrCreateThread(USER, UNBOOK_ID)).rejects.toMatchObject({ code: 'notFound' });

    fake.reset();
    fake.results.push([{ id: UNBOOK_ID, title: 'Milik orang', status: 'ready', sourceId: null }]);
    await expect(getOrCreateThread(USER, UNBOOK_ID)).rejects.toMatchObject({
      code: 'sourceUnavailable',
    });
  });

  it('rejects a foreign thread on every thread-scoped function', async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      ['context', () => getThreadContext(USER, THREAD_ID)],
      ['list', () => listMessages(USER, THREAD_ID)],
      ['turns', () => recentTurns(USER, THREAD_ID, 3)],
      ['user message', () => saveUserMessage(USER, THREAD_ID, 'Halo')],
      [
        'assistant message',
        () => saveAssistantMessage(USER, THREAD_ID, { content: 'Halo', citations: [] }),
      ],
      ['delete', () => deleteUserMessage(USER, MESSAGE_ID)],
    ];

    for (const [, action] of cases) {
      fake.reset();
      fake.results.push([]);
      await expect(action()).rejects.toMatchObject({ code: 'notFound' });
    }
  });
});

describe('getOrCreateThread', () => {
  it('returns the existing thread for the same Unbook', async () => {
    fake.results.push(
      [{ id: UNBOOK_ID, title: 'Unbook', status: 'ready', sourceId: OTHER_ID }],
      [{ threadId: THREAD_ID, unbookId: UNBOOK_ID, title: 'Unbook', createdAt: new Date() }],
    );

    await expect(getOrCreateThread(USER, UNBOOK_ID)).resolves.toMatchObject({
      threadId: THREAD_ID,
    });
    expect(fake.recorded.executes).toHaveLength(1);
    expect(fake.recorded.inserts).toHaveLength(0);
  });

  it('creates one thread titled after the Unbook when none exists', async () => {
    fake.results.push(
      [{ id: UNBOOK_ID, title: 'Filsafat Stoa', status: 'ready', sourceId: OTHER_ID }],
      [],
      [{ threadId: THREAD_ID, unbookId: UNBOOK_ID, title: 'Filsafat Stoa', createdAt: new Date() }],
    );

    await expect(getOrCreateThread(USER, UNBOOK_ID)).resolves.toMatchObject({
      title: 'Filsafat Stoa',
    });
    const insert = fake.recorded.inserts[0];
    expect(insert?.values).toMatchObject({
      userId: USER.userId,
      unbookId: UNBOOK_ID,
      title: 'Filsafat Stoa',
    });
  });
});

describe('message input', () => {
  it('trims a user message and stores at most 2,000 characters', async () => {
    fake.results.push(
      [{ id: THREAD_ID }],
      [{ id: MESSAGE_ID, role: 'user', content: 'Halo', citations: null }],
    );
    await saveUserMessage(USER, THREAD_ID, '  Halo  ');
    expect(fake.recorded.inserts.find((entry) => entry.table === mentorMessages)?.values).toMatchObject({
      content: 'Halo',
      role: 'user',
    });
  });

  it('rejects empty and over-long user messages before writing', async () => {
    await expect(saveUserMessage(USER, THREAD_ID, '   ')).rejects.toMatchObject({
      code: 'invalidInput',
    });
    await expect(saveUserMessage(USER, THREAD_ID, 'a'.repeat(2_001))).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(fake.recorded.transactionCount).toBe(0);
  });

  it('validates assistant citations', async () => {
    await expect(
      saveAssistantMessage(USER, THREAD_ID, {
        content: 'Jawaban',
        citations: [{ chunkId: 'not-a-uuid', page: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    expect(fake.recorded.transactionCount).toBe(0);
  });
});

describe('assertRateLimit', () => {
  const now = new Date('2026-11-03T10:00:00Z');

  it('allows the 30th message in the rolling minute', async () => {
    fake.results.push([{ value: 29 }]);
    await expect(assertRateLimit(USER, now)).resolves.toEqual({ remaining: 1 });
  });

  it('rejects once 30 user messages are already in the last minute', async () => {
    fake.results.push([{ value: 30 }]);
    await expect(assertRateLimit(USER, now)).rejects.toMatchObject({ code: 'rateLimited' });

    fake.reset();
    fake.results.push([{ value: 31 }]);
    await expect(assertRateLimit(USER, now)).rejects.toMatchObject({ code: 'rateLimited' });
  });
});
