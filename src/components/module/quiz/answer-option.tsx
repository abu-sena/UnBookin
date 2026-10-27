'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type AnswerOptionState = 'default' | 'selected' | 'correct' | 'incorrect';

export type AnswerOptionProps = {
  /** Zero-based position; renders the A/B/C letter. */
  index: number;
  label: string;
  state: AnswerOptionState;
  multi?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  className?: string;
};

const stateClasses: Record<AnswerOptionState, string> = {
  default: 'border-border bg-surface text-text hover:bg-surface-2',
  selected: 'border-primary bg-primary-soft text-text',
  correct: 'border-success bg-success/10 text-text',
  incorrect: 'border-danger bg-danger/10 text-text',
};

function optionLetter(index: number) {
  return String.fromCharCode(65 + (index % 26));
}

/**
 * One quiz answer button (E5-01 AC1/AC2). Height is at least 48 px. Correct
 * and incorrect states add an icon and a text label, so the result is never
 * conveyed by colour alone.
 */
export function AnswerOption({
  index,
  label,
  state,
  multi = false,
  disabled = false,
  onSelect,
  className,
}: AnswerOptionProps) {
  const t = useTranslations('quiz.option');
  const letter = optionLetter(index);
  const checked = state !== 'default';
  const status = state === 'correct' ? t('correct') : state === 'incorrect' ? t('incorrect') : null;

  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={checked}
      aria-label={`${t('optionAria', { letter })}. ${label}${status ? ` — ${status}` : ''}`}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-button)] border px-4 py-3 text-left transition-colors duration-fast ease-out-soft focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default',
        stateClasses[state],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'text-small flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-full)] border font-semibold',
          state === 'correct'
            ? 'border-success bg-success text-primary-foreground'
            : state === 'incorrect'
              ? 'border-danger bg-danger text-primary-foreground'
              : state === 'selected'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface-2 text-text-muted',
        )}
      >
        {state === 'correct' ? (
          <CheckIcon className="size-4" />
        ) : state === 'incorrect' ? (
          <XIcon className="size-4" />
        ) : (
          letter
        )}
      </span>

      <span className="text-body min-w-0 flex-1">{label}</span>

      {status ? (
        <span
          className={cn(
            'text-caption shrink-0 font-semibold',
            state === 'correct' ? 'text-success' : 'text-danger',
          )}
        >
          {status}
        </span>
      ) : state === 'selected' ? (
        <span className="sr-only">{t('selected')}</span>
      ) : null}
    </button>
  );
}
