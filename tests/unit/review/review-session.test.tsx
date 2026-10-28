import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/id.json';

const mocks = vi.hoisted(() => ({
  rate: vi.fn(),
  complete: vi.fn(),
  dueTomorrow: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('@/lib/learning/actions', () => ({
  rateReviewCard: mocks.rate,
  completeReviewSession: mocks.complete,
}));
vi.mock('@/app/(app)/review/actions', () => ({
  countReviewDueTomorrow: mocks.dueTomorrow,
}));

import { ReviewSession } from '@/components/review/review-session';
import type { ReviewQueueCard } from '@/lib/learning/queries';

afterEach(cleanup);

const cards: ReviewQueueCard[] = [
  {
    cardId: '11111111-1111-4111-8111-111111111111',
    front: 'Apa inti dari sistem, bukan panggung?',
    back: 'Pemimpin membangun cara kerja yang bertahan tanpa dirinya.',
    moduleTitle: 'Kepemimpinan',
    box: 0,
  },
  {
    cardId: '22222222-2222-4222-8222-222222222222',
    front: 'Kapan kebiasaan menjadi otomatis?',
    back: 'Saat isyarat dan ganjaran sudah menyatu.',
    moduleTitle: 'Kebiasaan',
    box: 1,
  },
];

function mount(props: Partial<React.ComponentProps<typeof ReviewSession>> = {}) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <ReviewSession cards={cards} dueTomorrow={2} {...props} />
    </NextIntlClientProvider>,
  );
}

function flipFirstCard() {
  fireEvent.click(screen.getByRole('button', { name: /Apa inti dari sistem/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dueTomorrow.mockResolvedValue(4);
});

describe('ReviewSession', () => {
  it('keeps the rating buttons disabled until the card is flipped', () => {
    mount();

    expect(screen.getByRole('button', { name: 'Ingat' })).toBeDisabled();
    flipFirstCard();
    expect(screen.getByRole('button', { name: 'Ingat' })).toBeEnabled();
  });

  it('rates the flipped card and advances optimistically to the next card', async () => {
    let resolveRating: (value: unknown) => void = () => {};
    mocks.rate.mockReturnValue(
      new Promise((resolve) => {
        resolveRating = resolve;
      }),
    );
    mount();

    flipFirstCard();
    fireEvent.click(screen.getByRole('button', { name: 'Ingat' }));

    expect(screen.getByText(cards[1]!.front)).toBeInTheDocument();
    expect(mocks.rate).toHaveBeenCalledWith({ cardId: cards[0]!.cardId, result: 'good' });

    resolveRating({ ok: true, box: 1, dueAt: new Date().toISOString() });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ingat' })).toBeDisabled());
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('keeps the card and offers a retry when the rating fails', async () => {
    mocks.rate
      .mockResolvedValueOnce({ ok: false, code: 'failed' })
      .mockResolvedValueOnce({ ok: true, box: 1, dueAt: new Date().toISOString() });
    mount();

    flipFirstCard();
    fireEvent.click(screen.getByRole('button', { name: 'Ragu' }));

    expect(await screen.findByText(messages.reviewSession.rateError)).toBeInTheDocument();
    expect(screen.getByText(cards[0]!.front)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: messages.reviewSession.retry }));

    await waitFor(() => expect(screen.getByText(cards[1]!.front)).toBeInTheDocument());
    expect(mocks.rate).toHaveBeenCalledTimes(2);
    expect(mocks.rate).toHaveBeenLastCalledWith({ cardId: cards[0]!.cardId, result: 'hard' });
  });

  it('calls completeReviewSession once at the end and shows XP only when awarded', async () => {
    mocks.rate.mockResolvedValue({ ok: true, box: 1, dueAt: new Date().toISOString() });
    mocks.complete.mockResolvedValue({ ok: true, xpAwarded: true, reviewedToday: 2 });
    mount();

    flipFirstCard();
    fireEvent.click(screen.getByRole('button', { name: 'Ingat' }));
    await waitFor(() => expect(screen.getByText(cards[1]!.front)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Kapan kebiasaan/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Lupa' }));

    expect(await screen.findByText(messages.reviewSession.summary.title)).toBeInTheDocument();
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.dueTomorrow).toHaveBeenCalledTimes(1);
    expect(screen.getByText('+10 XP')).toBeInTheDocument();
    expect(screen.getByText('Besok: 4 kartu')).toBeInTheDocument();
    expect(screen.getByText(messages.reviewSession.summary.description.replace('{count}', '2')));
  });

  it('does not show XP when the daily award was already claimed', async () => {
    mocks.rate.mockResolvedValue({ ok: true, box: 1, dueAt: new Date().toISOString() });
    mocks.complete.mockResolvedValue({ ok: true, xpAwarded: false, reviewedToday: 1 });
    mount({ cards: [cards[0]!] });

    flipFirstCard();
    fireEvent.click(screen.getByRole('button', { name: 'Ingat' }));

    expect(await screen.findByText(messages.reviewSession.summary.title)).toBeInTheDocument();
    expect(screen.queryByText('+10 XP')).not.toBeInTheDocument();
  });

  it('shows the empty queue with one action back to Home', () => {
    mount({ cards: [] });

    expect(screen.getByText(messages.review.empty.message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.review.empty.action }));
    expect(mocks.push).toHaveBeenCalledWith('/home');
  });
});
