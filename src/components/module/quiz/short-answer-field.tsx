'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type ShortAnswerFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  maxLength?: number;
  id?: string;
  disabled?: boolean;
  className?: string;
};

/** Short-answer textarea with a live character counter (E5-01 AC3). */
export function ShortAnswerField({
  value,
  onValueChange,
  maxLength = 500,
  id,
  disabled = false,
  className,
}: ShortAnswerFieldProps) {
  const t = useTranslations('quiz.shortAnswer');
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const counterId = `${fieldId}-counter`;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={fieldId}>{t('label')}</Label>
      <Textarea
        id={fieldId}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={t('placeholder')}
        aria-describedby={counterId}
        onChange={(event) => onValueChange(event.target.value)}
        className="min-h-32"
      />
      <p
        id={counterId}
        className="text-caption text-text-muted self-end tabular-nums"
        aria-label={t('counterAria', { count: value.length, max: maxLength })}
      >
        {t('counter', { count: value.length, max: maxLength })}
      </p>
    </div>
  );
}
