import { describe, expect, it } from 'vitest';
import {
  createMentorEventReader,
  formatMentorEvent,
  mentorRequestSchema,
  toAllowanceView,
  type MentorStreamEvent,
} from '@/lib/mentor/protocol';

const allowance = toAllowanceView({
  limit: 20,
  used: 3,
  remaining: 17,
  resetsAt: new Date('2026-12-01T00:00:00.000Z'),
});
const started: MentorStreamEvent = {
  type: 'started',
  userMessageId: '11111111-1111-4111-8111-111111111111',
  allowance,
};
const segment: MentorStreamEvent = {
  type: 'segment',
  segment: { type: 'text', text: 'Halo 👋\n\nbaris baru' },
};

describe('mentor stream protocol', () => {
  it('round-trips events split at every position', () => {
    const wire = formatMentorEvent(started) + formatMentorEvent(segment);
    for (let cut = 1; cut < wire.length; cut += 1) {
      const reader = createMentorEventReader();
      const events = [...reader.push(wire.slice(0, cut)), ...reader.push(wire.slice(cut))];
      expect(events).toEqual([started, segment]);
    }
  });

  it('ignores malformed frames and unknown event shapes', () => {
    const reader = createMentorEventReader();
    const events = reader.push(
      `: keep-alive\n\ndata: {nope\n\ndata: {"type":"delta","text":"raw"}\n\n${formatMentorEvent(segment)}`,
    );
    expect(events).toEqual([segment]);
  });

  it('validates the question length', () => {
    expect(mentorRequestSchema.safeParse({ message: '  ' }).success).toBe(false);
    expect(mentorRequestSchema.safeParse({ message: 'x'.repeat(2_001) }).success).toBe(false);
    expect(mentorRequestSchema.safeParse({ message: 'Apa intinya?', userId: 'x' }).success).toBe(
      false,
    );
    expect(mentorRequestSchema.parse({ message: ' Apa intinya? ' }).message).toBe('Apa intinya?');
  });
});
