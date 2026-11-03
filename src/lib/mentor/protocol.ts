import { z } from 'zod';
import { MENTOR_ERROR_CODES } from './errors';

/**
 * Wire contract between `POST /api/mentor/[threadId]` and the chat UI (PRD E10-01). The route runs the
 * answer parser on the server, so the client only ever receives safe segments, never raw markers.
 * Pure module: safe to import from client components.
 */

export const MAX_MENTOR_QUESTION_CHARS = 2_000;

export const mentorRequestSchema = z.strictObject({
  message: z.string().trim().min(1).max(MAX_MENTOR_QUESTION_CHARS),
});
export type MentorRequest = z.infer<typeof mentorRequestSchema>;

/** Serializable allowance; `limit` and `remaining` are `null` when unlimited. */
export const mentorAllowanceViewSchema = z.strictObject({
  limit: z.number().int().nonnegative().nullable(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative().nullable(),
  resetsAt: z.iso.datetime(),
});
export type MentorAllowanceView = z.infer<typeof mentorAllowanceViewSchema>;

export function toAllowanceView(allowance: {
  limit: number | null;
  used: number;
  remaining: number | null;
  resetsAt: Date;
}): MentorAllowanceView {
  return {
    limit: allowance.limit,
    used: allowance.used,
    remaining: allowance.remaining,
    resetsAt: allowance.resetsAt.toISOString(),
  };
}

const answerSegmentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), text: z.string() }),
  z.strictObject({
    type: z.literal('citation'),
    n: z.number().int().positive(),
    chunkId: z.uuid(),
    page: z.number().int().nullable(),
  }),
  z.strictObject({ type: z.literal('outside-start') }),
  z.strictObject({ type: z.literal('outside-end') }),
]);

export const mentorErrorCodeSchema = z.enum(MENTOR_ERROR_CODES);

export const mentorStreamEventSchema = z.discriminatedUnion('type', [
  /** The user message is saved and quota reserved; `allowance` already counts this message. */
  z.strictObject({
    type: z.literal('started'),
    userMessageId: z.uuid(),
    allowance: mentorAllowanceViewSchema,
  }),
  z.strictObject({ type: z.literal('segment'), segment: answerSegmentSchema }),
  /** `finish: 'aborted'` is a user stop: the partial answer is saved and the quota stays spent. */
  z.strictObject({
    type: z.literal('done'),
    messageId: z.uuid(),
    finish: z.enum(['stop', 'length', 'aborted']),
    allowance: mentorAllowanceViewSchema,
  }),
  /** `refunded: true` means no answer started: the turn was removed and the quota returned. */
  z.strictObject({
    type: z.literal('error'),
    code: mentorErrorCodeSchema,
    refunded: z.boolean(),
    allowance: mentorAllowanceViewSchema.nullable(),
  }),
]);
export type MentorStreamEvent = z.infer<typeof mentorStreamEventSchema>;

/** JSON body of a non-200 response, sent before any stream starts. */
export const mentorErrorBodySchema = z.strictObject({
  code: mentorErrorCodeSchema,
  allowance: mentorAllowanceViewSchema.nullable(),
});
export type MentorErrorBody = z.infer<typeof mentorErrorBodySchema>;

export function formatMentorEvent(event: MentorStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Incremental SSE reader; malformed frames are ignored, frames may split anywhere. */
export function createMentorEventReader(): { push(text: string): MentorStreamEvent[] } {
  let buffer = '';
  return {
    push(text) {
      buffer += text.replaceAll('\r\n', '\n');
      const events: MentorStreamEvent[] = [];
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
        if (!frame.startsWith('data: ')) continue;
        try {
          const parsed = mentorStreamEventSchema.safeParse(JSON.parse(frame.slice(6)));
          if (parsed.success) events.push(parsed.data);
        } catch {
          // A malformed frame must not end the conversation.
        }
      }
      return events;
    },
  };
}
