'use client';

import { PartyPopperIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type QuizResultPanelProps = {
  passed: boolean;
  /** Percentage from 0 to 100. */
  score: number;
  weakConcepts?: string[];
  onRelearn?: () => void;
  onRetry?: () => void;
  /** Rendered beside the "XP kamu" label, e.g. an XPToast. */
  xpSlot?: React.ReactNode;
  className?: string;
};

const confettiColours = [
  'bg-primary',
  'bg-xp',
  'bg-success',
  'bg-warning',
  'bg-danger',
] as const;

const confettiPieces = Array.from({ length: 16 }, (_value, index) => index);

/**
 * Quiz result panel (E5-01 AC5/AC6): a calm pass celebration with score and XP
 * slot, or a "Hampir!" screen with weak concepts and both recovery actions.
 * The confetti burst lasts 1.1 s and is hidden when reduced motion is on.
 */
export function QuizResultPanel({
  passed,
  score,
  weakConcepts = [],
  onRelearn,
  onRetry,
  xpSlot,
  className,
}: QuizResultPanelProps) {
  const t = useTranslations('quiz.result');
  const safeScore = Math.min(100, Math.max(0, Math.round(score)));

  return (
    <section
      className={cn(
        'border-border bg-surface relative isolate flex flex-col gap-4 overflow-hidden rounded-[var(--radius-card)] border p-5',
        className,
      )}
    >
      {passed ? (
        <>
          <style>{`
            @keyframes quiz-confetti-burst {
              0% { opacity: 1; transform: translate3d(0, -8px, 0) rotate(0deg); }
              100% { opacity: 0; transform: translate3d(0, 110px, 0) rotate(240deg); }
            }
          `}</style>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden overflow-hidden motion-safe:block"
          >
            {confettiPieces.map((piece) => (
              <span
                key={piece}
                className={cn(
                  'absolute top-0 size-2 rounded-[2px]',
                  confettiColours[piece % confettiColours.length],
                )}
                style={{
                  left: `${(piece * 7 + 3) % 100}%`,
                  animation: `quiz-confetti-burst 1.1s var(--ease-out-soft) ${(piece % 5) * 60}ms both`,
                }}
              />
            ))}
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-1">
        <p
          className={cn(
            'text-h2 flex items-center gap-2',
            passed ? 'text-success' : 'text-text',
          )}
        >
          {passed ? <PartyPopperIcon className="size-6 shrink-0" aria-hidden="true" /> : null}
          {passed ? t('passedTitle') : t('failedTitle')}
        </p>
        <p className="text-body text-text-muted">{passed ? t('passedBody') : t('failedBody')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-h3 tabular-nums">{t('score', { score: safeScore })}</p>
        {passed && xpSlot ? (
          <div className="flex items-center gap-2">
            <span className="text-caption text-text-muted">{t('xpLabel')}</span>
            {xpSlot}
          </div>
        ) : null}
      </div>

      {!passed && weakConcepts.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-small font-semibold">{t('weakTitle')}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {weakConcepts.map((concept) => (
              <li key={concept} className="text-small text-text-muted">
                {concept}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!passed ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" onClick={onRelearn}>
            {t('relearn')}
          </Button>
          <Button type="button" variant="outline" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
