import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => session.user }));

import { and, asc, count, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { createMentorEventReader, type MentorStreamEvent } from '@/lib/mentor/protocol';

/**
 * REAL-DB end-to-end turn. SKIPPED unless MENTOR_DB_URL is set.
 * Safety: local host only, database name must contain "test". The AI provider
 * is the only mocked dependency; the real store and quota functions run.
 */
const URL_VALUE = process.env.MENTOR_DB_URL ?? '';

function assertLocalTestDatabase(value: string): void {
  const parsed = new URL(value);
  const host = parsed.hostname;
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['127.0.0.1', 'localhost'].includes(host) || !name.includes('test')) {
    throw new Error('MENTOR_DB_URL must be a local database whose name includes "test".');
  }
}

const CHUNK_TEXT =
  'Kepemimpinan adalah kemampuan memengaruhi orang lain untuk mencapai tujuan bersama.';

type Fixture = {
  userId: string;
  unbookId: string;
  sourceId: string;
  interestId: string;
  chunkId: string;
  threadId: string;
  cleanup: () => Promise<void>;
};

type Database = PostgresJsDatabase<typeof schema>;

async function createFixture(db: Database): Promise<Fixture> {
  const userId = randomUUID();
  const unbookId = randomUUID();
  const sourceId = randomUUID();
  const interestId = randomUUID();
  const chunkId = randomUUID();

  await db.insert(schema.users).values({ id: userId, name: 'M7 Route Check' });
  await db.insert(schema.profiles).values({
    userId,
    jobRole: 'Manajer',
    goal: 'Memimpin tim',
    experienceLevel: 'intermediate',
  });
  await db.insert(schema.interests).values({
    id: interestId,
    slug: `m7-route-${randomUUID().slice(0, 8)}`,
    name: 'Kepemimpinan',
    colorToken: 'primary',
  });
  await db.insert(schema.sources).values({
    id: sourceId,
    userId,
    type: 'text',
    title: 'Sumber M7 Route',
    rightsConfirmedAt: new Date(),
    status: 'ready',
  });
  await db.insert(schema.sourceChunks).values({
    id: chunkId,
    sourceId,
    idx: 0,
    pageFrom: 12,
    pageTo: 13,
    chapterTitle: 'Bab 1',
    text: CHUNK_TEXT,
    tokenCount: 20,
  });
  await db.insert(schema.unbooks).values({
    id: unbookId,
    userId,
    sourceId,
    title: 'Unbook M7 Route',
    interestId,
    status: 'ready',
    moduleCount: 1,
    completedAt: new Date(),
  });

  const store = await import('@/lib/mentor/store');
  const thread = await store.getOrCreateThread({ userId }, unbookId);

  return {
    userId,
    unbookId,
    sourceId,
    interestId,
    chunkId,
    threadId: thread.threadId,
    cleanup: async () => {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
      await db.delete(schema.interests).where(eq(schema.interests.id, interestId));
    },
  };
}

function makeRequest(threadId: string, signal?: AbortSignal): Request {
  return new Request(`http://localhost:3000/api/mentor/${threadId}`, {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Apa inti kepemimpinan?' }),
    signal,
  });
}

async function readEvents(response: Response): Promise<MentorStreamEvent[]> {
  return createMentorEventReader().push(await response.text());
}

const encoder = new TextEncoder();

function chatSse(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function chatFetch(text: string) {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/chat/completions')) {
      return new Response(chatSse(text), { status: 200 });
    }
    throw new Error('unexpected AI request');
  });
}

function failingFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/chat/completions')) {
      return new Response(null, { status: 500 });
    }
    throw new Error('unexpected AI request');
  });
}

function stoppableFetch(text: string, onDelta: () => void) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).endsWith('/chat/completions')) {
      throw new Error('unexpected AI request');
    }
    const upstream = init?.signal ?? undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const fail = () => {
          try {
            controller.error(new DOMException('Aborted', 'AbortError'));
          } catch {
            // Already closed.
          }
        };
        if (upstream?.aborted) return fail();
        upstream?.addEventListener('abort', fail, { once: true });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
          ),
        );
        onDelta();
      },
    });
    return new Response(body, { status: 200 });
  });
}

describe.skipIf(!URL_VALUE)('mentor turn real DB (isolated local DB)', () => {
  it('saves both messages with citations and charges one message', async () => {
    assertLocalTestDatabase(URL_VALUE);
    const inherited = process.env.DATABASE_URL;
    if (inherited && inherited !== URL_VALUE) {
      throw new Error('DATABASE_URL must be unset or equal to MENTOR_DB_URL for this test.');
    }
    process.env.DATABASE_URL = URL_VALUE;
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    vi.stubGlobal('fetch', chatFetch('Kepemimpinan adalah [[1]].'));

    const client = postgres(URL_VALUE, { prepare: false, max: 10 });
    const db = drizzle(client, { schema, casing: 'snake_case' });
    let fixture: Fixture | null = null;
    let createdPlanId: string | null = null;
    let createdConfigId: string | null = null;

    try {
      const [plan] = await db
        .select({ id: schema.plans.id })
        .from(schema.plans)
        .where(eq(schema.plans.code, 'free'))
        .limit(1);
      if (!plan) {
        const [createdPlan] = await db
          .insert(schema.plans)
          .values({
            code: 'free',
            name: 'Gratis',
            priceIdr: 0,
            interval: 'month',
            limits: {
              unbooksPerMonth: 2,
              unbooksFairUse: 2,
              maxPagesPerSource: 500,
              maxFileMb: 50,
              mentorMessagesPerMonth: 20,
              originalsAccess: 'sample',
              modelTier: 'economy',
            },
          })
          .returning({ id: schema.plans.id });
        createdPlanId = createdPlan?.id ?? null;
      }
      const [config] = await db
        .select({ id: schema.aiTaskConfigs.id })
        .from(schema.aiTaskConfigs)
        .where(eq(schema.aiTaskConfigs.task, 'mentor_chat'))
        .limit(1);
      if (!config) {
        const [createdConfig] = await db
          .insert(schema.aiTaskConfigs)
          .values({
            task: 'mentor_chat',
            model: 'fixture/mentor-chat',
            temperature: 0.7,
            maxOutputTokens: 512,
          })
          .returning({ id: schema.aiTaskConfigs.id });
        createdConfigId = createdConfig?.id ?? null;
      }

      fixture = await createFixture(db);
      session.user = { id: fixture.userId };
      const { runMentorTurn } = await import('@/lib/mentor/chat');
      const response = await runMentorTurn(makeRequest(fixture.threadId), fixture.threadId);
      const events = await readEvents(response);

      expect(response.status).toBe(200);
      expect(events.at(-1)).toMatchObject({ type: 'done', finish: 'stop' });

      const quota = await import('@/lib/billing/mentor-quota');
      const allowance = await quota.getMentorAllowance(fixture.userId);
      expect(allowance.used).toBe(1);

      const rows = await db
        .select({ role: schema.mentorMessages.role, content: schema.mentorMessages.content, citations: schema.mentorMessages.citations })
        .from(schema.mentorMessages)
        .where(eq(schema.mentorMessages.threadId, fixture.threadId))
        .orderBy(asc(schema.mentorMessages.createdAt), asc(schema.mentorMessages.id));
      expect(rows.map((row) => row.role)).toEqual(['user', 'assistant']);
      expect(rows[1]?.content).toBe('Kepemimpinan adalah [[1]].');
      expect(rows[1]?.citations).toEqual([{ chunkId: fixture.chunkId, page: 12 }]);
    } finally {
      vi.unstubAllGlobals();
      session.user = null;
      if (fixture) await fixture.cleanup();
      if (createdConfigId) {
        await db.delete(schema.aiTaskConfigs).where(eq(schema.aiTaskConfigs.id, createdConfigId));
      }
      if (createdPlanId) {
        await db.delete(schema.plans).where(eq(schema.plans.id, createdPlanId));
      }
      await client.end();
      const shared = (globalThis as { unbookinDb?: { $client: { end: () => Promise<void> } } })
        .unbookinDb;
      await shared?.$client.end();
      delete (globalThis as { unbookinDb?: unknown }).unbookinDb;
    }
  });
});

async function openTestDb(): Promise<{
  db: Database;
  client: ReturnType<typeof postgres>;
  fixture: Fixture;
  createdPlanId: string | null;
  createdConfigId: string | null;
}> {
  assertLocalTestDatabase(URL_VALUE);
  const inherited = process.env.DATABASE_URL;
  if (inherited && inherited !== URL_VALUE) {
    throw new Error('DATABASE_URL must be unset or equal to MENTOR_DB_URL for this test.');
  }
  process.env.DATABASE_URL = URL_VALUE;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  const client = postgres(URL_VALUE, { prepare: false, max: 10 });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  let createdPlanId: string | null = null;
  let createdConfigId: string | null = null;
  const [plan] = await db
    .select({ id: schema.plans.id })
    .from(schema.plans)
    .where(eq(schema.plans.code, 'free'))
    .limit(1);
  if (!plan) {
    const [created] = await db
      .insert(schema.plans)
      .values({
        code: 'free',
        name: 'Gratis',
        priceIdr: 0,
        interval: 'month',
        limits: {
          unbooksPerMonth: 2,
          unbooksFairUse: 2,
          maxPagesPerSource: 500,
          maxFileMb: 50,
          mentorMessagesPerMonth: 20,
          originalsAccess: 'sample',
          modelTier: 'economy',
        },
      })
      .returning({ id: schema.plans.id });
    createdPlanId = created?.id ?? null;
  }
  const [config] = await db
    .select({ id: schema.aiTaskConfigs.id })
    .from(schema.aiTaskConfigs)
    .where(eq(schema.aiTaskConfigs.task, 'mentor_chat'))
    .limit(1);
  if (!config) {
    const [created] = await db
      .insert(schema.aiTaskConfigs)
      .values({
        task: 'mentor_chat',
        model: 'fixture/mentor-chat',
        temperature: 0.7,
        maxOutputTokens: 512,
      })
      .returning({ id: schema.aiTaskConfigs.id });
    createdConfigId = created?.id ?? null;
  }

  const fixture = await createFixture(db);
  session.user = { id: fixture.userId };
  return { db, client, fixture, createdPlanId, createdConfigId };
}

async function closeTestDb(
  db: Database,
  client: ReturnType<typeof postgres>,
  fixture: Fixture,
  createdPlanId: string | null,
  createdConfigId: string | null,
): Promise<void> {
  vi.unstubAllGlobals();
  session.user = null;
  await fixture.cleanup();
  if (createdConfigId) {
    await db.delete(schema.aiTaskConfigs).where(eq(schema.aiTaskConfigs.id, createdConfigId));
  }
  if (createdPlanId) {
    await db.delete(schema.plans).where(eq(schema.plans.id, createdPlanId));
  }
  await client.end();
  const shared = (globalThis as { unbookinDb?: { $client: { end: () => Promise<void> } } })
    .unbookinDb;
  await shared?.$client.end();
  delete (globalThis as { unbookinDb?: unknown }).unbookinDb;
}

describe.skipIf(!URL_VALUE)('mentor turn real DB failures', () => {
  it('leaves no messages and charges nothing when the provider fails before text', async () => {
    vi.stubGlobal('fetch', failingFetch());
    const harness = await openTestDb();
    try {
      const { runMentorTurn } = await import('@/lib/mentor/chat');
      const response = await runMentorTurn(
        makeRequest(harness.fixture.threadId),
        harness.fixture.threadId,
      );
      const events = await readEvents(response);

      expect(events.at(-1)).toMatchObject({
        type: 'error',
        code: 'failed',
        refunded: true,
      });
      const quota = await import('@/lib/billing/mentor-quota');
      expect((await quota.getMentorAllowance(harness.fixture.userId)).used).toBe(0);
      const [row] = await harness.db
        .select({ value: count() })
        .from(schema.mentorMessages)
        .where(eq(schema.mentorMessages.threadId, harness.fixture.threadId));
      expect(Number(row?.value)).toBe(0);
    } finally {
      await closeTestDb(
        harness.db,
        harness.client,
        harness.fixture,
        harness.createdPlanId,
        harness.createdConfigId,
      );
    }
  });

  it('keeps the partial answer and charges one when the user stops after text', async () => {
    let markDelta: () => void = () => undefined;
    const deltaSeen = new Promise<void>((resolve) => {
      markDelta = resolve;
    });
    vi.stubGlobal('fetch', stoppableFetch('Jawaban terpotong', () => setTimeout(markDelta, 25)));
    const harness = await openTestDb();
    const abort = new AbortController();
    try {
      const { runMentorTurn } = await import('@/lib/mentor/chat');
      const response = await runMentorTurn(
        makeRequest(harness.fixture.threadId, abort.signal),
        harness.fixture.threadId,
      );
      await deltaSeen;
      abort.abort();
      const events = await readEvents(response);

      expect(events.at(-1)).toMatchObject({ type: 'done', finish: 'aborted' });
      const quota = await import('@/lib/billing/mentor-quota');
      expect((await quota.getMentorAllowance(harness.fixture.userId)).used).toBe(1);
      const rows = await harness.db
        .select({ role: schema.mentorMessages.role, content: schema.mentorMessages.content })
        .from(schema.mentorMessages)
        .where(and(eq(schema.mentorMessages.threadId, harness.fixture.threadId)))
        .orderBy(asc(schema.mentorMessages.createdAt), asc(schema.mentorMessages.id));
      expect(rows.map((row) => row.role)).toEqual(['user', 'assistant']);
      expect(rows[1]?.content).toContain('Jawaban terpotong');
    } finally {
      await closeTestDb(
        harness.db,
        harness.client,
        harness.fixture,
        harness.createdPlanId,
        harness.createdConfigId,
      );
    }
  });
});
