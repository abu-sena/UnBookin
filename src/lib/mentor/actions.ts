'use server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { sourceChunks } from '@/db/schema';
import { loadPersona } from '@/lib/ai/personas';
import { requireUser } from '@/lib/auth/session';
import { getMentorAllowance } from '@/lib/billing/mentor-quota';
import { excerptText } from '@/lib/learning/queries';
import { MentorError, toMentorErrorCode, type MentorResult } from './errors';
import { toAllowanceView, type MentorAllowanceView } from './protocol';
import {
  getOrCreateThread,
  getThreadContext,
  listMessages,
  type MentorCitation,
  type MentorMessageView,
} from './store';
import { getSuggestedQuestions, type MentorSuggestion } from './suggestions';

/**
 * Server Actions for the mentor sheet (E10-01). Authentication runs before any try/catch so the
 * redirect propagates; identity comes from the session and only safe codes cross the boundary.
 */

const PAGE_SIZE = 30;

export type MentorMessageDto = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: MentorCitation[];
  createdAt: string;
};

export type MentorThreadPayload = {
  threadId: string;
  title: string;
  mentorName: string;
  messages: MentorMessageDto[];
  hasOlder: boolean;
  allowance: MentorAllowanceView;
  suggestions: MentorSuggestion[];
};

export type MentorExcerpt = {
  chunkId: string;
  pageFrom: number | null;
  pageTo: number | null;
  text: string;
};

function toDto(message: MentorMessageView): MentorMessageDto {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    citations: message.citations ?? [],
    createdAt: message.createdAt.toISOString(),
  };
}

function run<T>(operation: () => Promise<T>): Promise<MentorResult<T>> {
  return operation().then(
    (data): MentorResult<T> => ({ ok: true, ...data }),
    (error: unknown): MentorResult<T> => ({ ok: false, code: toMentorErrorCode(error) }),
  );
}

const openSchema = z.strictObject({ unbookId: z.uuid(), moduleId: z.uuid().optional() });
const olderSchema = z.strictObject({
  threadId: z.uuid(),
  before: z.strictObject({ createdAt: z.iso.datetime(), id: z.uuid() }),
});
const excerptSchema = z.strictObject({ threadId: z.uuid(), chunkId: z.uuid() });

/** Opens (or creates) the one thread for this Unbook with history, quota and suggestions. */
export async function openMentorThread(input: unknown): Promise<MentorResult<MentorThreadPayload>> {
  const user = await requireUser('/home');
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };
  const identity = { userId: user.id };

  return run(async () => {
    const thread = await getOrCreateThread(identity, parsed.data.unbookId);
    const [context, page, allowance, suggestions] = await Promise.all([
      getThreadContext(identity, thread.threadId),
      listMessages(identity, thread.threadId, { limit: PAGE_SIZE + 1 }),
      getMentorAllowance(user.id),
      getSuggestedQuestions(identity, parsed.data.unbookId, parsed.data.moduleId),
    ]);
    const persona = await loadPersona(context.interestSlug);
    const hasOlder = page.length > PAGE_SIZE;
    return {
      threadId: thread.threadId,
      title: thread.title,
      mentorName: persona.name,
      messages: (hasOlder ? page.slice(1) : page).map(toDto),
      hasOlder,
      allowance: toAllowanceView(allowance),
      suggestions,
    };
  });
}

export async function loadOlderMentorMessages(
  input: unknown,
): Promise<MentorResult<{ messages: MentorMessageDto[]; hasOlder: boolean }>> {
  const user = await requireUser('/home');
  const parsed = olderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };

  return run(async () => {
    const page = await listMessages({ userId: user.id }, parsed.data.threadId, {
      limit: PAGE_SIZE + 1,
      before: { createdAt: new Date(parsed.data.before.createdAt), id: parsed.data.before.id },
    });
    const hasOlder = page.length > PAGE_SIZE;
    return { messages: (hasOlder ? page.slice(1) : page).map(toDto), hasOlder };
  });
}

/** A short quote for a citation chip; the chunk must belong to this thread's own source. */
export async function getMentorCitationExcerpt(
  input: unknown,
): Promise<MentorResult<MentorExcerpt>> {
  const user = await requireUser('/home');
  const parsed = excerptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalidInput' };

  return run(async () => {
    const context = await getThreadContext({ userId: user.id }, parsed.data.threadId);
    const [chunk] = await db
      .select({
        chunkId: sourceChunks.id,
        pageFrom: sourceChunks.pageFrom,
        pageTo: sourceChunks.pageTo,
        text: sourceChunks.text,
      })
      .from(sourceChunks)
      .where(
        and(eq(sourceChunks.id, parsed.data.chunkId), eq(sourceChunks.sourceId, context.sourceId)),
      )
      .limit(1);
    if (!chunk) throw new MentorError('notFound');
    return { ...chunk, text: excerptText(chunk.text) };
  });
}
