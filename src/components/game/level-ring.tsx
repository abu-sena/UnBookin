import { useTranslations } from 'next-intl';
import { ProgressRing } from './progress-ring';
import { clampFraction } from './level-meta';

export type LevelRingProps = {
  level: number;
  /** Fraction of the current level band, 0..1 (clamped). */
  progress: number;
  /** `null` at the level cap. */
  nextLevelXp: number | null;
  size?: number;
  className?: string;
};

/** Player level ring with an accessible progressbar (E8-02). */
export function LevelRing({ level, progress, nextLevelXp, size = 120, className }: LevelRingProps) {
  const t = useTranslations('game.level');
  const fraction = nextLevelXp === null ? 1 : clampFraction(progress);
  const percent = Math.round(fraction * 100);
  const label =
    nextLevelXp === null
      ? t('ringAriaMax', { level })
      : t('ringAria', { level, percent, next: level + 1 });

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={className}
    >
      <ProgressRing fraction={fraction} size={size} strokeWidth={10} arcClassName="stroke-xp">
        <span className="flex flex-col items-center leading-tight">
          <span className="text-caption text-text-muted">{t('short')}</span>
          <span className="text-h1 tabular-nums">{level}</span>
        </span>
      </ProgressRing>
    </div>
  );
}
