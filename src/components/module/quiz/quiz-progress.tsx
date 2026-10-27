import { useTranslations } from 'next-intl';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export type QuizProgressProps = {
  current: number;
  total: number;
  className?: string;
};

/** Quiz progress bar with "Soal 3 dari 8" text (E5-01 AC1). */
export function QuizProgress({ current, total, className }: QuizProgressProps) {
  const t = useTranslations('quiz.progress');
  const safeTotal = Math.max(0, total);
  const safeCurrent = Math.min(Math.max(0, current), safeTotal);
  const percent = safeTotal === 0 ? 0 : Math.round((safeCurrent / safeTotal) * 100);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-small tabular-nums">{t('label', { current: safeCurrent, total: safeTotal })}</span>
        <span className="text-caption text-text-muted tabular-nums">{percent}%</span>
      </div>
      <Progress
        value={percent}
        aria-label={t('ariaLabel', { current: safeCurrent, total: safeTotal })}
      />
    </div>
  );
}
