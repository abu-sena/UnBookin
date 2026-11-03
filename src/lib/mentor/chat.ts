import 'server-only';
import { eq } from 'drizzle-orm';
import { after } from 'next/server';
import { db } from '@/db';
import { interests, profiles } from '@/db/schema';
import { loadPersona } from '@/lib/ai/personas';
import { MENTOR_PROMPT_VERSION, buildMentorMessages } from '@/lib/ai/prompts/mentor-chat';
import type { LearningProfile } from '@/lib/ai/prompts/shared';
import { streamChatTask, type ChatUsage } from '@/lib/ai/stream-chat';
import { getCurrentUser } from '@/lib/auth/session';
import {
  getMentorAllowance,
  refundMentorMessage,
  reserveMentorMessage,
  type MentorAllowance,
  type MentorReservation,
} from '@/lib/billing/mentor-quota';
import { createAnswerParser, finalizeAnswer, type AnswerSegment, type AnswerParser } from './answer';
import { toMentorErrorCode, type MentorErrorCode } from './errors';
import {
  formatMentorEvent,
  mentorRequestSchema,
  toAllowanceView,
  type MentorAllowanceView,
  type MentorErrorBody,
  type MentorStreamEvent,
} from './protocol';
import { retrieveChunks, type RetrievedChunk } from './retrieval';
import {
  assertRateLimit,
  deleteUserMessage,
  getThreadContext,
  recentTurns,
  saveAssistantMessage,
  saveUserMessage,
  type MentorThreadContext,
} from './store';

/**
 * The mentor turn behind `POST /api/mentor/[threadId]` (E10-01). It is kept out
 * of the route so the whole flow is unit-testable with mocked dependencies.
 *
 * Order is binding (docs/M7-PLAN.md): Origin → session → body → owned thread →
 * rate limit → quota reservation → save question → stream → save answer.
 */

/** A mentor turn never needs more than one short question plus JSON overhead. */
const MAX_BODY_BYTES = 8 * 1024;
/** Founder decision: the model sees the six exchanges before this one. */
const HISTORY_EXCHANGES = 6;
const HISTORY_MESSAGES = HISTORY_EXCHANGES * 2;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
} as const;

const EMPTY_USAGE: ChatUsage = { inputTokens: null, outputTokens: null, costUsd: null };

type Finish = 'stop' | 'length' | 'aborted';

type SessionUser = { id: string };

type TurnArgs = {
  request: Request;
  identity: { userId: string };
  context: MentorThreadContext;
  reservation: MentorReservation;
  allowance: MentorAllowance;
  userMessageId: string;
  question: string;
};

type TurnSink = {
  send(event: MentorStreamEvent): void;
  close(): void;
};

type BodyResult = { ok: true; value: unknown } | { ok: false };

function jsonError(
  status: number,
  code: MentorErrorCode,
  allowance: MentorAllowanceView | null,
): Response {
  const body: MentorErrorBody = { code, allowance };
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

function statusForCode(code: MentorErrorCode): number {
  switch (code) {
    case 'invalidInput':
      return 400;
    case 'notFound':
      return 404;
    case 'quotaExceeded':
      return 402;
    case 'rateLimited':
      return 429;
    case 'sourceUnavailable':
      return 409;
    default:
      return 500;
  }
}

/** A route handler has no Server Action CSRF protection, so `Origin` must match. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    return false;
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      // A malformed deployment URL must not widen the allowlist.
    }
  }
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

async function readBoundedBody(request: Request): Promise<BodyResult> {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isFinite(size) || size < 0 || size > MAX_BODY_BYTES) return { ok: false };
  }
  if (!request.body) return { ok: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    chunks.push(value);
  }

  const decoder = new TextDecoder();
  let text = '';
  for (const chunk of chunks) text += decoder.decode(chunk, { stream: true });
  text += decoder.decode();
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

async function safeAllowance(userId: string): Promise<MentorAllowanceView | null> {
  try {
    return toAllowanceView(await getMentorAllowance(userId));
  } catch {
    return null;
  }
}

async function refundOnce(
  userId: string,
  reservation: MentorReservation,
): Promise<MentorAllowanceView | null> {
  try {
    await refundMentorMessage(userId, reservation);
  } catch {
    return null;
  }
  return safeAllowance(userId);
}

async function loadLearningProfile(userId: string, interestSlug: string): Promise<LearningProfile> {
  const [[profileRow], [interestRow]] = await Promise.all([
    db
      .select({
        jobRole: profiles.jobRole,
        goal: profiles.goal,
        experienceLevel: profiles.experienceLevel,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1),
    db
      .select({ name: interests.name })
      .from(interests)
      .where(eq(interests.slug, interestSlug))
      .limit(1),
  ]);
  return {
    jobRole: profileRow?.jobRole ?? '',
    goal: profileRow?.goal ?? '',
    experienceLevel: profileRow?.experienceLevel ?? '',
    interest: interestRow?.name ?? '',
  };
}

/** Persist a complete or partial answer; a storage failure never throws out of the stream. */
async function persistAnswer(
  identity: { userId: string },
  threadId: string,
  raw: string,
  chunks: readonly RetrievedChunk[],
  usage: ChatUsage,
): Promise<{ id: string } | null> {
  try {
    const finalized = finalizeAnswer(raw, chunks);
    if (!finalized.content.trim()) return null;
    return await saveAssistantMessage(identity, threadId, {
      content: finalized.content,
      citations: finalized.citations,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
  } catch {
    return null;
  }
}

async function executeMentorTurn(args: TurnArgs, sink: TurnSink): Promise<void> {
  const { identity, context, reservation, allowance, userMessageId, question, request } = args;

  let refunded = false;
  let hasText = false;
  let parserEnded = false;
  let raw = '';
  let finish: Finish = 'stop';
  let usage: ChatUsage = EMPTY_USAGE;
  let parser: AnswerParser | null = null;
  let chunks: RetrievedChunk[] = [];

  const allowanceView = toAllowanceView(allowance);

  const emit = (segments: AnswerSegment[]): void => {
    for (const segment of segments) {
      if (segment.type === 'text' && segment.text.trim().length > 0) hasText = true;
      sink.send({ type: 'segment', segment });
    }
  };

  const endParser = (): void => {
    if (!parser || parserEnded) return;
    parserEnded = true;
    emit(parser.end());
  };

  const refundBeforeText = async (): Promise<MentorAllowanceView | null> => {
    if (refunded) return allowanceView;
    refunded = true;
    try {
      await deleteUserMessage(identity, userMessageId);
    } catch {
      // The refund still matters even if the orphan could not be removed.
    }
    return refundOnce(identity.userId, reservation);
  };

  const failBeforeText = async (): Promise<void> => {
    const fresh = await refundBeforeText();
    sink.send({ type: 'error', code: 'failed', refunded: true, allowance: fresh });
  };

  const failAfterText = async (): Promise<void> => {
    await persistAnswer(identity, context.threadId, raw, chunks, usage);
    sink.send({ type: 'error', code: 'failed', refunded: false, allowance: allowanceView });
  };

  sink.send({ type: 'started', userMessageId, allowance: allowanceView });

  try {
    const turns = await recentTurns(identity, context.threadId, HISTORY_EXCHANGES + 1);
    const history = turns
      .filter((turn) => turn.id !== userMessageId)
      .slice(-HISTORY_MESSAGES)
      .map((turn) => ({ role: turn.role, content: turn.content }));

    const retrieved = await retrieveChunks({
      sourceId: context.sourceId,
      question,
      userId: identity.userId,
    });
    chunks = retrieved.chunks;

    const [persona, profile] = await Promise.all([
      loadPersona(context.interestSlug),
      loadLearningProfile(identity.userId, context.interestSlug),
    ]);

    parser = createAnswerParser(chunks);
    const messages = buildMentorMessages({ persona, profile, chunks, history, question });

    for await (const event of streamChatTask({
      task: 'mentor_chat',
      messages,
      userId: identity.userId,
      promptVersion: MENTOR_PROMPT_VERSION,
      signal: request.signal,
    })) {
      if (event.type === 'delta') {
        raw += event.text;
        emit(parser.push(event.text));
      } else {
        finish = event.finish;
        usage = event.usage;
      }
    }
    endParser();

    if (!hasText) {
      await failBeforeText();
      sink.close();
      return;
    }

    const saved = await persistAnswer(identity, context.threadId, raw, chunks, usage);
    if (!saved) {
      sink.send({ type: 'error', code: 'failed', refunded: false, allowance: allowanceView });
      sink.close();
      return;
    }
    sink.send({ type: 'done', messageId: saved.id, finish, allowance: allowanceView });
    sink.close();
  } catch {
    // Do not flush a held marker on failure: a split `[[` must never reach the UI raw.
    if (hasText) await failAfterText();
    else await failBeforeText();
    sink.close();
  }
}

function keepAliveUntil(work: Promise<void>): void {
  try {
    after(() => work);
  } catch {
    // Outside a request scope (unit tests) there is no platform lifetime to extend.
  }
}

function streamTurn(args: TurnArgs): Response {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const sink: TurnSink = {
    send(event) {
      if (closed || !controller) return;
      try {
        controller.enqueue(encoder.encode(formatMentorEvent(event)));
      } catch {
        // The client went away; the turn still saves and refunds below.
        closed = true;
      }
    },
    close() {
      if (closed || !controller) return;
      closed = true;
      try {
        controller.close();
      } catch {
        // Already closed by the runtime.
      }
    },
  };

  const body = new ReadableStream<Uint8Array>({
    start(next) {
      controller = next;
      const turn = executeMentorTurn(args, sink).catch(() => {
        sink.close();
      });
      // The answer must still be saved (or the quota refunded) after the client disconnects, when
      // a serverless function could otherwise be frozen mid-turn.
      keepAliveUntil(turn);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(body, { status: 200, headers: SSE_HEADERS });
}

/** POST /api/mentor/[threadId] entry point: reject early, then stream one turn. */
export async function runMentorTurn(request: Request, threadId: string): Promise<Response> {
  if (!isSameOrigin(request)) return jsonError(403, 'invalidInput', null);

  let user: SessionUser | null;
  try {
    user = await getCurrentUser();
  } catch {
    return jsonError(500, 'failed', null);
  }
  if (!user) return jsonError(401, 'notFound', null);

  const body = await readBoundedBody(request);
  if (!body.ok) return jsonError(400, 'invalidInput', null);
  const parsed = mentorRequestSchema.safeParse(body.value);
  if (!parsed.success) return jsonError(400, 'invalidInput', null);

  const identity = { userId: user.id };

  let context: MentorThreadContext;
  try {
    context = await getThreadContext(identity, threadId);
  } catch (error) {
    const code = toMentorErrorCode(error);
    return jsonError(statusForCode(code), code, null);
  }

  try {
    await assertRateLimit(identity);
  } catch (error) {
    const code = toMentorErrorCode(error);
    return jsonError(statusForCode(code), code, null);
  }

  let reservation: MentorReservation;
  let allowance: MentorAllowance;
  try {
    const reserved = await reserveMentorMessage(user.id);
    reservation = reserved.reservation;
    allowance = reserved.allowance;
  } catch (error) {
    const code = toMentorErrorCode(error);
    if (code === 'quotaExceeded') {
      return jsonError(402, 'quotaExceeded', await safeAllowance(user.id));
    }
    return jsonError(statusForCode(code), code, null);
  }

  let userMessageId: string;
  try {
    const saved = await saveUserMessage(identity, threadId, parsed.data.message);
    userMessageId = saved.id;
  } catch {
    return jsonError(500, 'failed', await refundOnce(user.id, reservation));
  }

  return streamTurn({
    request,
    identity,
    context,
    reservation,
    allowance,
    userMessageId,
    question: parsed.data.message,
  });
}
