import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type XPToastProps = {
  /** XP gained, e.g. 30 renders "+30 XP". */
  amount: number;
  className?: string;
};

/**
 * "+30 XP" toast that rises 16 px and fades in over 1.2 s in the `--xp` colour
 * (PRD §12.7). The global reduced-motion rule makes it static. The visible
 * text is paired with a polite live region so screen readers hear the gain.
 */
export function XPToast({ amount, className }: XPToastProps) {
  const t = useTranslations('game.xpToast');

  return (
    <>
      <style>{`
        @keyframes xp-toast-rise {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <p role="status" aria-live="polite" className="contents">
        <span className="sr-only">{t('announce', { amount })}</span>
        <span
          aria-hidden="true"
          style={{ animation: 'xp-toast-rise 1.2s var(--ease-out-soft) both' }}
          className={cn(
            'text-xp text-h3 inline-block font-bold tabular-nums motion-reduce:animate-none',
            className,
          )}
        >
          {t('amount', { amount })}
        </span>
      </p>
    </>
  );
}
