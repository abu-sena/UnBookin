'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SelfGradePanelProps = {
  modelAnswer: string;
  onGrade: (matches: boolean) => void;
  disabled?: boolean;
  className?: string;
};

const rubricKeys = ['rubric1', 'rubric2', 'rubric3', 'rubric4'] as const;

/**
 * Fallback when the AI grader is unavailable (M5 plan #3, E5-01 AC3): show the
 * model answer and the 1–4 rubric, then let the learner grade themselves.
 */
export function SelfGradePanel({
  modelAnswer,
  onGrade,
  disabled = false,
  className,
}: SelfGradePanelProps) {
  const t = useTranslations('quiz.selfGrade');

  return (
    <section
      className={cn(
        'border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5',
        className,
      )}
    >
      <h3 className="text-h3">{t('title')}</h3>
      <p className="text-small text-text-muted">{t('note')}</p>

      <div className="bg-surface-2 flex flex-col gap-1 rounded-[var(--radius-input)] px-4 py-3">
        <span className="text-caption text-text-muted font-semibold tracking-wide uppercase">
          {t('modelAnswer')}
        </span>
        <p className="text-reading">{modelAnswer}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-small font-semibold">{t('rubricTitle')}</h4>
        <ul className="flex flex-col gap-1">
          {rubricKeys.map((key) => (
            <li key={key} className="text-small text-text-muted">
              {t(key)}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" disabled={disabled} onClick={() => onGrade(true)}>
          {t('match')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onGrade(false)}
        >
          {t('noMatch')}
        </Button>
      </div>
    </section>
  );
}
