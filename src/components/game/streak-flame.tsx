'use client';

import Link from 'next/link';
import { FlameIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useGameFeedback } from './game-feedback-context';

export type StreakFlameProps = {
  count: number;
  activeToday: boolean;
  className?: string;
};

/** Top-bar streak link: muted without activity today, animates once per day. */
export function StreakFlame({ count, activeToday, className }: StreakFlameProps) {
  const t = useTranslations('topBar');
  const feedback = useGameFeedback();
  const pulse = activeToday && feedback?.streakPulse === true;

  return (
    <Link
      href="/progress"
      aria-label={activeToday ? t('streakAriaActive', { count }) : t('streakAriaIdle', { count })}
      className={cn(
        'text-small inline-flex min-h-11 min-w-11 items-center justify-center gap-1 px-2 font-semibold tabular-nums',
        activeToday ? 'text-level-expert-text' : 'text-text-muted',
        className,
      )}
    >
      <FlameIcon
        className={cn('size-5', pulse && 'streak-flame-motion', !activeToday && 'opacity-60')}
        aria-hidden="true"
      />
      <span aria-hidden="true">{count}</span>
    </Link>
  );
}
