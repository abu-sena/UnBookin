import 'server-only';
import { and, count, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { interests, mentorMessages, mentorThreads, unbooks } from '@/db/schema';
import { MENTOR_RATE_LIMIT } from '@/lib/billing/mentor-quota';
import { MentorError } from './errors';

/**
 * Mentor threads and messages. Every function takes the session identity first
 * (never a client `userId`), filters by its owner and throws safe error codes.
 */

export const mentorIdentitySchema = z.object({ userId: z.uuid() });
export type MentorIdentity = z.infer<typeof mentorIdentitySchema>;

export type MentorTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type MentorReadDatabase = Pick<typeof db, 'select'>;

export type MentorThreadView = {
  threadId: string;
  unbookId: string;
  title: string;
  createdAt: Date;
};

export type MentorThreadContext = {
  threadId: string;
  unbookId: string;
  sourceId: string;
  interestSlug: string;
  unbookTitle: string;
};

export type MentorCitation = { chunkId: string; page: number | null };

export type MentorMessageView = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: MentorCitation[] | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
};

export type MentorMessageCursor = { createdAt: Date; id: string };

const assistantInputSchema = z.strictObject({
  content: z.string().trim().min(1).max(20_000),
  citations: z
    .array(z.strictObject({ chunkId: z.uuid(), page: z.number().int().nonnegative().nullable() }))
    .max(50)
    .default([]),
  inputTokens: z.number().int().nonnegative().nullable().optional(),
  outputTokens: z.number().int().nonnegative().nullable().optional(),
});

export function assertMentorIdentity(identity: MentorIdentity): MentorIdentity {
  const parsed = mentorIdentitySchema.safeParse(identity);
  if (!parsed.success) throw new MentorError('invalidInput');
  return parsed.data;
}

function requireUuid(value: unknown): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new MentorError('invalidInput');
  return parsed.data;
}

function requireNow(now: Date): Date {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new MentorError('invalidInput');
  }
  return now;
}

function toMessageView(row: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: MentorCitation[] | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
}): MentorMessageView {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citations: row.citations ?? null,
    inputTokens: row.inputTokens ?? null,
    outputTokens: row.outputTokens ?? null,
    createdAt: row.createdAt,
  };
}

const messageColumns = {
  id: mentorMessages.id,
  role: mentorMessages.role,
  content: mentorMessages.content,
  citations: mentorMessages.citations,
  inputTokens: mentorMessages.inputTokens,
  outputTokens: mentorMessages.outputTokens,
  createdAt: mentorMessages.createdAt,
};

/** One thread per user per Unbook, serialized by an advisory transaction lock. */
export async function getOrCreateThread(
  identity: MentorIdentity,
  unbookId: string,
): Promise<MentorThreadView> {
  const { userId } = assertMentorIdentity(identity);
  const parsedUnbookId = requireUuid(unbookId);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`mentor:${userId}:${parsedUnbookId}`}, 0))`,
    );

    const [unbook] = await tx
      .select({ id: unbooks.id, title: unbooks.title, status: unbooks.status, sourceId: unbooks.sourceId })
      .from(unbooks)
      .where(and(eq(unbooks.id, parsedUnbookId), eq(unbooks.userId, userId)))
      .limit(1);
    if (!unbook || unbook.status !== 'ready') throw new MentorError('notFound');
    if (!unbook.sourceId) throw new MentorError('sourceUnavailable');

    const [existing] = await tx
      .select({ threadId: mentorThreads.id, unbookId: mentorThreads.unbookId, title: mentorThreads.title, createdAt: mentorThreads.createdAt })
      .from(mentorThreads)
      .where(and(eq(mentorThreads.userId, userId), eq(mentorThreads.unbookId, parsedUnbookId)))
      .limit(1);
    if (existing) return existing;

    const [created] = await tx
      .insert(mentorThreads)
      .values({ userId, unbookId: parsedUnbookId, title: unbook.title })
      .returning({
        threadId: mentorThreads.id,
        unbookId: mentorThreads.unbookId,
        title: mentorThreads.title,
        createdAt: mentorThreads.createdAt,
      });
    if (!created) throw new MentorError('failed');
    return created;
  });
}

/** Owned thread plus the Unbook context the prompt needs; else `notFound`. */
export async function getThreadContext(
  identity: MentorIdentity,
  threadId: string,
): Promise<MentorThreadContext> {
  const { userId } = assertMentorIdentity(identity);
  const parsedThreadId = requireUuid(threadId);

  const [row] = await db
    .select({
      threadId: mentorThreads.id,
      unbookId: mentorThreads.unbookId,
      sourceId: unbooks.sourceId,
      interestSlug: interests.slug,
      unbookTitle: unbooks.title,
    })
    .from(mentorThreads)
    .innerJoin(unbooks, eq(unbooks.id, mentorThreads.unbookId))
    .leftJoin(interests, eq(interests.id, unbooks.interestId))
    .where(and(eq(mentorThreads.id, parsedThreadId), eq(mentorThreads.userId, userId)))
    .limit(1);
  if (!row) throw new MentorError('notFound');
  if (!row.sourceId) throw new MentorError('sourceUnavailable');
  return {
    threadId: row.threadId,
    unbookId: row.unbookId,
    sourceId: row.sourceId,
    interestSlug: row.interestSlug ?? 'general',
    unbookTitle: row.unbookTitle,
  };
}

async function assertOwnedThread(
  database: MentorReadDatabase,
  identity: MentorIdentity,
  threadId: string,
): Promise<void> {
  const [row] = await database
    .select({ id: mentorThreads.id })
    .from(mentorThreads)
    .where(and(eq(mentorThreads.id, threadId), eq(mentorThreads.userId, identity.userId)))
    .limit(1);
  if (!row) throw new MentorError('notFound');
}

const listInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(30),
  before: z.strictObject({ createdAt: z.date(), id: z.uuid() }).optional(),
});

/** Newest page, returned oldest-first; `before` is the `(created_at, id)` cursor. */
export async function listMessages(
  identity: MentorIdentity,
  threadId: string,
  input: { limit?: number; before?: MentorMessageCursor } = {},
): Promise<MentorMessageView[]> {
  const { userId } = assertMentorIdentity(identity);
  const parsedThreadId = requireUuid(threadId);
  const parsed = listInputSchema.safeParse(input);
  if (!parsed.success) throw new MentorError('invalidInput');

  await assertOwnedThread(db, { userId }, parsedThreadId);

  const conditions = [eq(mentorMessages.threadId, parsedThreadId)];
  if (parsed.data.before) {
    const cursor = parsed.data.before;
    const cursorCondition = or(
      lt(mentorMessages.createdAt, cursor.createdAt),
      and(eq(mentorMessages.createdAt, cursor.createdAt), lt(mentorMessages.id, cursor.id)),
    );
    if (cursorCondition) conditions.push(cursorCondition);
  }

  const rows = await db
    .select(messageColumns)
    .from(mentorMessages)
    .where(and(...conditions))
    .orderBy(desc(mentorMessages.createdAt), desc(mentorMessages.id))
    .limit(parsed.data.limit);

  return rows.reverse().map(toMessageView);
}

/** Last `n` exchanges (up to 2n messages) in chronological order for the prompt. */
export async function recentTurns(
  identity: MentorIdentity,
  threadId: string,
  n: number,
): Promise<MentorMessageView[]> {
  const { userId } = assertMentorIdentity(identity);
  const parsedThreadId = requireUuid(threadId);
  const parsed = z.number().int().min(1).max(20).safeParse(n);
  if (!parsed.success) throw new MentorError('invalidInput');

  await assertOwnedThread(db, { userId }, parsedThreadId);

  const rows = await db
    .select(messageColumns)
    .from(mentorMessages)
    .where(eq(mentorMessages.threadId, parsedThreadId))
    .orderBy(desc(mentorMessages.createdAt), desc(mentorMessages.id))
    .limit(parsed.data * 2);

  return rows.reverse().map(toMessageView);
}

const userContentSchema = z.string().trim().min(1).max(2_000);

/** Persist a user message after the quota was reserved and before the AI call. */
export async function saveUserMessage(
  identity: MentorIdentity,
  threadId: string,
  content: string,
): Promise<MentorMessageView> {
  const { userId } = assertMentorIdentity(identity);
  const parsedThreadId = requireUuid(threadId);
  const parsedContent = userContentSchema.safeParse(content);
  if (!parsedContent.success) throw new MentorError('invalidInput');

  return db.transaction(async (tx) => {
    await assertOwnedThread(tx, { userId }, parsedThreadId);
    const [row] = await tx
      .insert(mentorMessages)
      .values({ threadId: parsedThreadId, role: 'user', content: parsedContent.data })
      .returning(messageColumns);
    if (!row) throw new MentorError('failed');
    return toMessageView(row);
  });
}

/** Persist the assistant answer (or a partial answer after a user stop). */
export async function saveAssistantMessage(
  identity: MentorIdentity,
  threadId: string,
  input: {
    content: string;
    citations: MentorCitation[];
    inputTokens?: number | null;
    outputTokens?: number | null;
  },
): Promise<MentorMessageView> {
  const { userId } = assertMentorIdentity(identity);
  const parsedThreadId = requireUuid(threadId);
  const parsed = assistantInputSchema.safeParse(input);
  if (!parsed.success) throw new MentorError('invalidInput');

  return db.transaction(async (tx) => {
    await assertOwnedThread(tx, { userId }, parsedThreadId);
    const [row] = await tx
      .insert(mentorMessages)
      .values({
        threadId: parsedThreadId,
        role: 'assistant',
        content: parsed.data.content,
        citations: parsed.data.citations,
        inputTokens: parsed.data.inputTokens ?? null,
        outputTokens: parsed.data.outputTokens ?? null,
      })
      .returning(messageColumns);
    if (!row) throw new MentorError('failed');
    return toMessageView(row);
  });
}

/** Remove a failed user turn so it leaves no orphan when its quota is refunded. */
export async function deleteUserMessage(
  identity: MentorIdentity,
  messageId: string,
): Promise<{ deleted: true }> {
  const { userId } = assertMentorIdentity(identity);
  const parsedMessageId = requireUuid(messageId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: mentorMessages.id })
      .from(mentorMessages)
      .innerJoin(mentorThreads, eq(mentorThreads.id, mentorMessages.threadId))
      .where(
        and(
          eq(mentorMessages.id, parsedMessageId),
          eq(mentorMessages.role, 'user'),
          eq(mentorThreads.userId, userId),
        ),
      )
      .limit(1);
    if (!row) throw new MentorError('notFound');
    await tx.delete(mentorMessages).where(eq(mentorMessages.id, parsedMessageId));
    return { deleted: true as const };
  });
}

/** PRD §11 rate limit: at most 30 user messages per rolling minute. */
export async function assertRateLimit(
  identity: MentorIdentity,
  now: Date = new Date(),
): Promise<{ remaining: number }> {
  const { userId } = assertMentorIdentity(identity);
  const instant = requireNow(now);
  const since = new Date(instant.getTime() - MENTOR_RATE_LIMIT.windowMs);

  const [row] = await db
    .select({ value: count() })
    .from(mentorMessages)
    .innerJoin(mentorThreads, eq(mentorThreads.id, mentorMessages.threadId))
    .where(
      and(
        eq(mentorThreads.userId, userId),
        eq(mentorMessages.role, 'user'),
        gt(mentorMessages.createdAt, since),
      ),
    );

  const sent = Math.max(0, Number(row?.value ?? 0));
  if (sent >= MENTOR_RATE_LIMIT.maxMessages) throw new MentorError('rateLimited');
  return { remaining: MENTOR_RATE_LIMIT.maxMessages - sent };
}
