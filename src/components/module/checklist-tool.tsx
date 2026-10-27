'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export type ChecklistToolProps = {
  title: string;
  items: string[];
  checked: number[];
  onToggle: (index: number) => void;
  className?: string;
};

/**
 * Controlled checklist tool (E4-02 AC5). The page persists `checked`; this
 * component only reports toggles. Progress is text plus a bar so it does not
 * depend on colour alone.
 */
export function ChecklistTool({ title, items, checked, onToggle, className }: ChecklistToolProps) {
  const t = useTranslations('module.checklist');
  const baseId = useId();
  const checkedSet = new Set(checked);
  const total = items.length;
  const done = items.reduce((count, _item, index) => (checkedSet.has(index) ? count + 1 : count), 0);
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <section
      aria-label={title}
      className={cn(
        'border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-h3 min-w-0">{title}</h3>
        <span className="text-small text-text-muted shrink-0 tabular-nums">
          {t('progress', { checked: done, total })}
        </span>
      </div>

      <Progress
        value={percent}
        aria-label={t('progressAria', { checked: done, total })}
        className="motion-reduce:[&_[data-slot=progress-indicator]]:transition-none"
      />

      <ul className="flex flex-col gap-1">
        {items.map((item, index) => {
          const id = `${baseId}-item-${index}`;
          const isChecked = checkedSet.has(index);
          return (
            <li key={id}>
              <div className="flex min-h-11 items-center gap-3">
                <Checkbox
                  id={id}
                  checked={isChecked}
                  onCheckedChange={() => onToggle(index)}
                  aria-labelledby={`${id}-label`}
                />
                <Label
                  id={`${id}-label`}
                  htmlFor={id}
                  className={cn(
                    'min-w-0 cursor-pointer py-2 font-normal',
                    isChecked ? 'text-text-muted line-through' : 'text-text',
                  )}
                >
                  {item}
                </Label>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
