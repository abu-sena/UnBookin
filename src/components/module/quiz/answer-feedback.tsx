import { CheckCircle2Icon, InfoIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type AnswerFeedbackProps = {
  correct: boolean;
  explanation: string;
  /** Rendered next to the "Lihat di sumber" label, e.g. a SourceRef chip. */
  sourceSlot?: React.ReactNode;
  className?: string;
};

/**
 * Immediate answer feedback (E5-01 AC2, PRD §12.9): never shames a wrong
 * answer, always explains, and leaves room for a source link.
 */
export function AnswerFeedback({
  correct,
  explanation,
  sourceSlot,
  className,
}: AnswerFeedbackProps) {
  const t = useTranslations('quiz.feedback');
  const Icon = correct ? CheckCircle2Icon : InfoIcon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col gap-3 rounded-[var(--radius-card)] border p-4',
        correct ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10',
        className,
      )}
    >
      <p
        className={cn(
          'text-h3 flex items-center gap-2',
          correct ? 'text-success' : 'text-text',
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        {correct ? t('correctTitle') : t('incorrectTitle')}
      </p>
      <p className="text-reading">{explanation}</p>
      {sourceSlot ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-muted">{t('sourceCta')}</span>
          {sourceSlot}
        </div>
      ) : null}
    </div>
  );
}
