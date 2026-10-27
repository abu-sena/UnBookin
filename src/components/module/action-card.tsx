'use client';

import { CheckIcon, SparklesIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ActionCardStatus = 'idle' | 'pending' | 'created';

export type ActionCardProps = {
  title: string;
  steps: string[];
  doneWhen: string;
  status: ActionCardStatus;
  /** Already formatted due date, e.g. "3 November 2026". */
  dueDateText?: string;
  onCreate?: () => void;
  className?: string;
};

/**
 * "Aksi Minggu Ini" card (E4-02 AC5, PRD §12.7). Purely presentational: the
 * page creates the action and controls the idle/pending/created state.
 */
export function ActionCard({
  title,
  steps,
  doneWhen,
  status,
  dueDateText,
  onCreate,
  className,
}: ActionCardProps) {
  const t = useTranslations('module.action');
  const busy = status !== 'idle';

  return (
    <article
      className={cn(
        'border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-caption text-primary inline-flex items-center gap-1 font-semibold tracking-wide uppercase">
          <SparklesIcon className="size-4" aria-hidden="true" />
          {t('label')}
        </p>
        <h3 className="text-h3">{title}</h3>
      </div>

      <ol aria-label={t('stepsAria')} className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={`${index}-${step}`} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="bg-primary-soft text-primary text-caption mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-full)] font-semibold tabular-nums"
            >
              {index + 1}
            </span>
            <span className="text-body min-w-0">{step}</span>
          </li>
        ))}
      </ol>

      <p className="text-small text-text-muted">
        <span className="font-semibold">{t('doneWhen')}</span> {doneWhen}
      </p>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={status === 'idle' ? onCreate : undefined}
        >
          {status === 'created' ? <CheckIcon aria-hidden="true" /> : null}
          {status === 'idle' ? t('cta') : null}
          {status === 'pending' ? t('pending') : null}
          {status === 'created' ? t('created') : null}
        </Button>
        {status === 'created' && dueDateText ? (
          <p role="status" aria-live="polite" className="text-small text-success">
            {t('dueDate', { date: dueDateText })}
          </p>
        ) : null}
      </div>
    </article>
  );
}
