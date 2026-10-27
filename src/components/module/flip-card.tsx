'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type FlipCardProps = {
  front: string;
  back: string;
  flipped: boolean;
  onFlip: () => void;
  className?: string;
};

/**
 * Review card that flips on tap or Enter/Space (E6-01 AC2, PRD §12.7). The
 * flip is a 320 ms 3D transition; the global reduced-motion rule turns it into
 * an instant swap. The back side is announced through a polite live region.
 */
export function FlipCard({ front, back, flipped, onFlip, className }: FlipCardProps) {
  const t = useTranslations('review.card');
  const hintId = useId();

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <button
        type="button"
        aria-pressed={flipped}
        aria-describedby={hintId}
        onClick={onFlip}
        className="w-full rounded-[var(--radius-card)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [perspective:1200px]"
      >
        <span
          className={cn(
            'grid transition-transform duration-slow ease-out-soft [transform-style:preserve-3d]',
            flipped ? '[transform:rotateY(180deg)]' : '',
          )}
        >
          <span
            aria-hidden={flipped}
            className="border-border bg-surface flex min-h-44 flex-col gap-3 rounded-[var(--radius-card)] border p-5 [backface-visibility:hidden] [grid-area:1/1]"
          >
            <span className="text-caption text-text-muted font-semibold tracking-wide uppercase">
              {t('frontLabel')}
            </span>
            <span className="text-h3 block">{front}</span>
            <span className="text-small text-text-muted mt-auto inline-flex items-center gap-1">
              {t('flipHint')}
            </span>
          </span>

          <span
            aria-hidden={!flipped}
            className="border-primary/40 bg-primary-soft flex min-h-44 flex-col gap-3 rounded-[var(--radius-card)] border p-5 [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]"
          >
            <span className="text-caption text-text-muted font-semibold tracking-wide uppercase">
              {t('backLabel')}
            </span>
            <span className="text-reading block">{back}</span>
          </span>
        </span>
      </button>

      <p id={hintId} className="text-caption text-text-muted">
        {t('flipHint')}
      </p>

      <p role="status" aria-live="polite" className="sr-only">
        {flipped ? t('revealed', { answer: back }) : t('hidden')}
      </p>
    </div>
  );
}

export type ReviewRating = 'again' | 'hard' | 'good';

export type ReviewRatingBarProps = {
  disabled?: boolean;
  onRate: (rating: ReviewRating) => void;
  className?: string;
};

const ratings: ReviewRating[] = ['again', 'hard', 'good'];

/**
 * Lupa · Ragu · Ingat buttons (E6-01 AC2). Disabled until the card is flipped;
 * the hint explains why and the state is not conveyed by colour alone.
 */
export function ReviewRatingBar({ disabled = false, onRate, className }: ReviewRatingBarProps) {
  const t = useTranslations('review.rating');
  const hintId = useId();

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        role="group"
        aria-label={t('label')}
        aria-describedby={disabled ? hintId : undefined}
        className="grid grid-cols-3 gap-2"
      >
        {ratings.map((rating) => (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            onClick={() => onRate(rating)}
            className={cn(
              'min-h-11 rounded-[var(--radius-button)] border px-3 py-2 text-small font-semibold transition-colors duration-fast ease-out-soft focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
              rating === 'again'
                ? 'border-danger/40 bg-surface text-danger hover:bg-danger/10'
                : rating === 'good'
                  ? 'border-success/40 bg-surface text-success hover:bg-success/10'
                  : 'border-border bg-surface text-text hover:bg-surface-2',
            )}
          >
            {t(rating)}
          </button>
        ))}
      </div>
      {disabled ? (
        <p id={hintId} className="text-caption text-text-muted">
          {t('lockedHint')}
        </p>
      ) : null}
    </div>
  );
}
