'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FlipCard, ReviewRatingBar, type ReviewRating } from '@/components/module/flip-card';
import { ReviewQueueEmpty } from '@/components/module/review-queue-empty';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { completeReviewSession, rateReviewCard } from '@/lib/learning/actions';
import type { ReviewQueueCard } from '@/lib/learning/queries';
import { countReviewDueTomorrow } from '@/app/(app)/review/actions';
import { ReviewSummary, type ReviewRatingCounts, type ReviewSummaryData } from './review-summary';

const EMPTY_COUNTS: ReviewRatingCounts = { again: 0, hard: 0, good: 0 };

type FailedRating = { rating: ReviewRating; cardIndex: number };

export type ReviewSessionProps = {
  cards: ReviewQueueCard[];
  dueTomorrow: number;
};

/**
 * E6-01 AC2/AC4: one card at a time. The rating advances optimistically; when
 * the server rejects it the same card comes back with a calm retry, so a card
 * is never lost. The session closes once, at the end of the queue.
 */
export function ReviewSession({ cards, dueTomorrow }: ReviewSessionProps) {
  const t = useTranslations('reviewSession');
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<ReviewRatingCounts>(EMPTY_COUNTS);
  const [failed, setFailed] = useState<FailedRating | null>(null);
  const [finishFailed, setFinishFailed] = useState(false);
  const [summary, setSummary] = useState<ReviewSummaryData | null>(null);
  const finishingRef = useRef(false);

  const current = cards[index];

  async function finishSession(finalCounts: ReviewRatingCounts) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishFailed(false);
    let result: Awaited<ReturnType<typeof completeReviewSession>> | null = null;
    try {
      result = await completeReviewSession();
    } catch {
      result = null;
    }
    if (!result || !result.ok) {
      finishingRef.current = false;
      setFinishFailed(true);
      return;
    }
    let nextDueTomorrow = dueTomorrow;
    try {
      nextDueTomorrow = await countReviewDueTomorrow();
    } catch {
      nextDueTomorrow = dueTomorrow;
    }
    setSummary({
      reviewed: cards.length,
      counts: finalCounts,
      dueTomorrow: nextDueTomorrow,
      xpAwarded: result.xpAwarded,
    });
    router.refresh();
  }

  async function saveRating(
    card: ReviewQueueCard,
    rating: ReviewRating,
    cardIndex: number,
    previousCounts: ReviewRatingCounts,
  ) {
    const nextCounts: ReviewRatingCounts = {
      ...previousCounts,
      [rating]: previousCounts[rating] + 1,
    };
    setFailed(null);
    setFlipped(false);
    setIndex(cardIndex + 1);
    setCounts(nextCounts);
    setBusy(true);
    let ok = false;
    try {
      const result = await rateReviewCard({ cardId: card.cardId, result: rating });
      ok = result.ok;
    } catch {
      ok = false;
    }
    setBusy(false);
    if (!ok) {
      setCounts(previousCounts);
      setIndex(cardIndex);
      setFailed({ rating, cardIndex });
      return;
    }
    if (cardIndex === cards.length - 1) await finishSession(nextCounts);
  }

  function handleRate(rating: ReviewRating) {
    if (!current || !flipped || busy || failed) return;
    void saveRating(current, rating, index, counts);
  }

  function retryRating() {
    if (!failed || busy) return;
    const card = cards[failed.cardIndex];
    if (!card) return;
    void saveRating(card, failed.rating, failed.cardIndex, counts);
  }

  if (summary) return <ReviewSummary summary={summary} />;

  if (cards.length === 0) {
    return <ReviewQueueEmpty onStart={() => router.push('/home')} />;
  }

  if (index >= cards.length) {
    return (
      <section aria-live="polite" className="flex flex-col gap-3">
        <p className="text-body text-text-muted">{t('finishing')}</p>
        {finishFailed ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-small text-text-muted">
              {t('finishError')}
            </p>
            <Button type="button" variant="outline" onClick={() => void finishSession(counts)}>
              {t('finishRetry')}
            </Button>
          </div>
        ) : null}
      </section>
    );
  }

  if (!current) return null;
  const total = cards.length;
  const percent = Math.round((Math.min(index + 1, total) / total) * 100);

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-small tabular-nums">{t('progress', { current: index + 1, total })}</p>
        <Progress
          value={percent}
          aria-label={t('progressAria', { current: index + 1, total })}
        />
      </div>

      <p className="text-caption text-text-muted">{current.moduleTitle}</p>

      <FlipCard
        front={current.front}
        back={current.back}
        flipped={flipped}
        onFlip={() => {
          // The previous rating may still be saving (optimistic advance): flipping the next
          // card must already work; only rating waits until that save settles.
          if (!failed) setFlipped((value) => !value);
        }}
      />

      <ReviewRatingBar
        disabled={!flipped || busy || failed !== null}
        onRate={handleRate}
        className="mt-auto"
      />

      {failed ? (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-small text-text-muted">{t('rateError')}</p>
          <Button type="button" variant="outline" disabled={busy} onClick={retryRating}>
            {t('retry')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
