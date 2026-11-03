import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/id.json';
import { shouldAutoScroll } from '@/components/mentor/chat-scroll';
import { MentorChatSheet } from '@/components/mentor/mentor-chat-sheet';
import { formatResetDate } from '@/components/mentor/mentor-quota';
import { formatMentorEvent, toAllowanceView, type MentorStreamEvent } from '@/lib/mentor/protocol';
import { MESSAGE_ID, THREAD_ID, UNBOOK_ID, USER_MESSAGE_ID, renderWithIntl } from './harness';

const mocks = vi.hoisted(() => ({
  openMentorThread: vi.fn(),
  loadOlderMentorMessages: vi.fn(),
  getMentorCitationExcerpt: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/lib/mentor/actions', () => ({
  openMentorThread: mocks.openMentorThread,
  loadOlderMentorMessages: mocks.loadOlderMentorMessages,
  getMentorCitationExcerpt: mocks.getMentorCitationExcerpt,
}));
vi.mock('@/lib/analytics/events', () => ({ track: mocks.track }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => true }));

const fetchMock = vi.fn();
const encoder = new TextEncoder();

function allowance(remaining = 17) {
  return toAllowanceView({
    limit: 20,
    used: 20 - remaining,
    remaining,
    resetsAt: new Date('2026-12-01T00:00:00.000Z'),
  });
}

function threadPayload(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    threadId: THREAD_ID,
    title: 'Pemimpin yang Membangun Sistem',
    mentorName: 'Mentor Kepemimpinan',
    messages: [],
    hasOlder: false,
    allowance: allowance(),
    suggestions: [
      { key: 'genericBigIdea', params: {} },
      { key: 'genericExamples', params: {} },
      { key: 'genericApply', params: {} },
    ],
    ...overrides,
  };
}

function streamResponse(chunks: string[], status = 200) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

function eventStream(events: MentorStreamEvent[], split = 0): Response {
  const wire = events.map(formatMentorEvent).join('');
  return streamResponse(split > 0 ? [wire.slice(0, split), wire.slice(split)] : [wire]);
}

function mount() {
  return renderWithIntl(
    <MentorChatSheet open onOpenChange={() => undefined} unbookId={UNBOOK_ID} />,
  );
}

async function openWith(payload: ReturnType<typeof threadPayload>) {
  mocks.openMentorThread.mockResolvedValue(payload);
  mount();
  await screen.findAllByText('Mentor Kepemimpinan');
}

function sendMessage(text: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: messages.mentor.send }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const started: MentorStreamEvent = {
  type: 'started',
  userMessageId: USER_MESSAGE_ID,
  allowance: allowance(16),
};
const firstSegment: MentorStreamEvent = {
  type: 'segment',
  segment: { type: 'text', text: 'Halo ' },
};
const secondSegment: MentorStreamEvent = {
  type: 'segment',
  segment: { type: 'text', text: 'dunia' },
};
const done: MentorStreamEvent = {
  type: 'done',
  messageId: MESSAGE_ID,
  finish: 'stop',
  allowance: allowance(16),
};

describe('mentor chat sheet', () => {
  it('streams segments in order from frames split mid-event', async () => {
    fetchMock.mockResolvedValue(eventStream([started, firstSegment, secondSegment, done], 20));
    await openWith(threadPayload());

    sendMessage('Apa intinya?');

    expect(await screen.findAllByText('Halo dunia')).not.toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/mentor/${THREAD_ID}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: 'Apa intinya?' }),
      }),
    );
    expect(mocks.track).toHaveBeenCalledWith('mentor_message_sent');
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Sisa 16 pesan bulan ini')).toBeInTheDocument();
  });

  it('stops a live answer, aborts the request and keeps the partial text', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              formatMentorEvent(started) +
                formatMentorEvent({
                  type: 'segment',
                  segment: { type: 'text', text: 'Sebagian' },
                }),
            ),
          );
          const onAbort = () => controller.error(new DOMException('Aborted', 'AbortError'));
          if (signal?.aborted) onAbort();
          else signal?.addEventListener('abort', onAbort);
        },
      });
      return Promise.resolve(new Response(stream, { status: 200 }));
    });
    await openWith(threadPayload());

    sendMessage('Apa intinya?');
    expect(await screen.findByText('Sebagian')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: messages.mentor.stop }));

    await waitFor(() =>
      expect(screen.getAllByText(messages.mentor.notices.stopped).length).toBeGreaterThan(0),
    );
    expect(screen.getByText('Sebagian')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.mentor.send })).toBeInTheDocument();
  });

  it('mirrors the server refund when stopped before any text', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(formatMentorEvent(started)));
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('Aborted', 'AbortError')),
          );
        },
      });
      return Promise.resolve(new Response(stream, { status: 200 }));
    });
    await openWith(threadPayload({ allowance: allowance(17) }));

    sendMessage('Apa intinya?');
    await screen.findByRole('button', { name: messages.mentor.stop });
    await waitFor(() => expect(screen.getByText(/Sisa 16 /)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: messages.mentor.stop }));

    await waitFor(() => expect(screen.getByText(messages.mentor.notices.refunded)).toBeInTheDocument());
    expect(screen.getByRole('textbox')).toHaveValue('Apa intinya?');
    expect(screen.getByText(/Sisa 17 /)).toBeInTheDocument();
    expect(screen.queryByText('Apa intinya?', { selector: 'p,span,div' })).toBeNull();
  });

  it('removes the optimistic bubble and restores the input when refunded', async () => {
    fetchMock.mockResolvedValue(
      eventStream([
        started,
        { type: 'error', code: 'failed', refunded: true, allowance: allowance() },
      ]),
    );
    await openWith(threadPayload());

    sendMessage('Apa intinya?');

    expect(await screen.findByText(messages.mentor.notices.refunded)).toBeInTheDocument();
    await waitFor(() =>
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Apa intinya?'),
    );
    const leftovers = screen
      .queryAllByText('Apa intinya?')
      .filter((element) => element.tagName !== 'TEXTAREA');
    expect(leftovers).toHaveLength(0);
  });

  it('disables the input at zero quota and shows the refill date and pricing link', async () => {
    const empty = allowance(0);
    await openWith(threadPayload({ allowance: empty }));

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getAllByText(messages.mentor.quotaEmpty)).not.toHaveLength(0);

    const expected = messages.mentor.quotaReset.replace('{date}', formatResetDate(empty.resetsAt));
    await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument());

    expect(screen.getByRole('link', { name: messages.mentor.quotaCta })).toHaveAttribute(
      'href',
      '/#harga-title',
    );
  });

  it('sends a suggestion chip as the user message', async () => {
    fetchMock.mockResolvedValue(eventStream([started, firstSegment, done]));
    await openWith(threadPayload());

    const suggestion = messages.mentor.suggestions.genericBigIdea;
    fireEvent.click(screen.getByRole('button', { name: suggestion }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/mentor/${THREAD_ID}`,
        expect.objectContaining({ body: JSON.stringify({ message: suggestion }) }),
      ),
    );
    expect(mocks.track).toHaveBeenCalledWith('mentor_message_sent');
  });

  it('prepends older messages without changing their order', async () => {
    const payload = threadPayload({
      hasOlder: true,
      messages: [
        {
          id: MESSAGE_ID,
          role: 'user',
          content: 'Baru',
          citations: [],
          createdAt: '2026-11-03T10:00:00.000Z',
        },
      ],
    });
    mocks.loadOlderMentorMessages.mockResolvedValue({
      ok: true,
      messages: [
        {
          id: USER_MESSAGE_ID,
          role: 'user',
          content: 'Lama',
          citations: [],
          createdAt: '2026-11-02T10:00:00.000Z',
        },
      ],
      hasOlder: false,
    });
    await openWith(payload);

    expect(await screen.findByText('Baru')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.mentor.loadOlder }));

    expect(await screen.findByText('Lama')).toBeInTheDocument();
    const content = document.body.textContent ?? '';
    expect(content.indexOf('Lama')).toBeLessThan(content.indexOf('Baru'));
    expect(mocks.loadOlderMentorMessages).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      before: { createdAt: '2026-11-03T10:00:00.000Z', id: MESSAGE_ID },
    });
  });

  it('autoscrolls only while already near the bottom', () => {
    expect(shouldAutoScroll({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 })).toBe(true);
    expect(shouldAutoScroll({ scrollTop: 100, scrollHeight: 1000, clientHeight: 100 })).toBe(false);
  });
});
