import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type XPToastProps = {
  /** XP gained, e.g. 30 renders "+30 XP". */
  amount: number;
  className?: string;
};

/**
 * "+30 XP" toast that rises and fades out within 1.2 s in the `--xp` colour
 * (PRD §12.7). The keyframes live in globals.css; reduced motion makes it
 * static. The visible text is paired with a polite live region so screen
 * readers hear the gain.
 */
export function XPToast({ amount, className }: XPToastProps) {
  const t = useTranslations('game.xpToast');

  return (
    <p role="status" aria-live="polite" className="contents">
      <span className="sr-only">{t('announce', { amount })}</span>
      <span
        aria-hidden="true"
        className={cn(
          'xp-toast-motion text-xp text-h3 pointer-events-none inline-block font-bold tabular-nums',
          className,
        )}
      >
        {t('amount', { amount })}
      </span>
    </p>
  );
}
