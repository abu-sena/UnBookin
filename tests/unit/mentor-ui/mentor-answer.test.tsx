import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/id.json';
import {
  createAnswerParser,
  finalizeAnswer,
  renderSegments,
  type AnswerChunk,
  type AnswerSegment,
} from '@/lib/mentor/answer';
import { appendAnswerSegment } from '@/components/mentor/answer-body';
import { AnswerBody } from '@/components/mentor/answer-body';
import { MentorAnswer } from '@/components/mentor/answer-view';
import { CHUNK_ID, THREAD_ID, renderWithIntl } from './harness';

const mocks = vi.hoisted(() => ({
  getMentorCitationExcerpt: vi.fn(),
  openMentorThread: vi.fn(),
  loadOlderMentorMessages: vi.fn(),
}));

vi.mock('@/lib/mentor/actions', () => mocks);
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => true }));

const chunks: AnswerChunk[] = [{ id: CHUNK_ID, pageFrom: 12, pageTo: null }];
const raw = 'Pemimpin membangun sistem[[1]]. Umum <<luar-sumber>>Catatan umum<</luar-sumber>>';

function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(cleanup);

describe('mentor answer rendering', () => {
  it('renders stored and live segments identically', () => {
    const finalized = finalizeAnswer(raw, chunks);
    const stored = renderSegments(finalized.content, finalized.citations);

    const parser = createAnswerParser(chunks);
    const events = [...parser.push(raw.slice(0, 9)), ...parser.push(raw.slice(9)), ...parser.end()];
    const live = events.reduce<AnswerSegment[]>(
      (segments, segment) => appendAnswerSegment(segments, segment),
      [],
    );

    const storedView = renderWithIntl(
      <div data-testid="stored">
        <MentorAnswer segments={stored} threadId={THREAD_ID} />
      </div>,
    );
    const liveView = renderWithIntl(
      <div data-testid="live">
        <MentorAnswer segments={live} threadId={THREAD_ID} />
      </div>,
    );

    expect(storedView.getByTestId('stored').textContent).toBe(
      liveView.getByTestId('live').textContent,
    );
  });

  it('never shows raw citation or outside markers', () => {
    const finalized = finalizeAnswer(raw, chunks);
    const segments = renderSegments(finalized.content, finalized.citations);
    const { container } = renderWithIntl(<MentorAnswer segments={segments} threadId={THREAD_ID} />);

    expect(container.textContent).not.toContain('[[');
    expect(container.textContent).not.toContain('<<');
    expect(screen.getByRole('group', { name: messages.mentor.outsideLabel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'hlm. 12' })).toBeInTheDocument();
  });

  it('renders HTML in text as plain text', () => {
    const segments: AnswerSegment[] = [{ type: 'text', text: '<b>tebal</b>\nbaris dua' }];
    const { container } = renderWithIntl(
      <AnswerBody segments={segments} renderCitation={() => null} />,
    );

    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>tebal</b>');
  });

  it('fetches a citation excerpt on open and shows loading then ready', async () => {
    const pending = deferred<unknown>();
    mocks.getMentorCitationExcerpt.mockReturnValueOnce(pending.promise);
    renderWithIntl(
      <MentorAnswer
        segments={[{ type: 'citation', n: 1, chunkId: CHUNK_ID, page: 12 }]}
        threadId={THREAD_ID}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'hlm. 12' }));
    expect(screen.getByText(messages.module.source.loading)).toBeInTheDocument();
    expect(mocks.getMentorCitationExcerpt).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      chunkId: CHUNK_ID,
    });

    pending.settle({
      ok: true,
      chunkId: CHUNK_ID,
      pageFrom: 12,
      pageTo: 12,
      text: 'Kutipan sumber.',
    });

    expect(await screen.findByText('Kutipan sumber.')).toBeInTheDocument();
  });

  it('shows an excerpt error with a retry that recovers', async () => {
    mocks.getMentorCitationExcerpt
      .mockResolvedValueOnce({ ok: false, code: 'failed' })
      .mockResolvedValueOnce({
        ok: true,
        chunkId: CHUNK_ID,
        pageFrom: 4,
        pageTo: 4,
        text: 'Kutipan pulih.',
      });
    renderWithIntl(
      <MentorAnswer
        segments={[{ type: 'citation', n: 1, chunkId: CHUNK_ID, page: null }]}
        threadId={THREAD_ID}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: messages.module.source.chipFallback }));
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.module.source.error);

    fireEvent.click(screen.getByRole('button', { name: messages.module.source.retry }));
    expect(await screen.findByText('Kutipan pulih.')).toBeInTheDocument();
    expect(mocks.getMentorCitationExcerpt).toHaveBeenCalledTimes(2);
  });
});
