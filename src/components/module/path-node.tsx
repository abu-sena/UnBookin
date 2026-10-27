'use client';

import { CheckIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type PathNodeState = 'locked' | 'available' | 'current' | 'done';

export type PathNodeProps = {
  number: number;
  title: string;
  minutes: number;
  state: PathNodeState;
  onSelect?: (number: number) => void;
  className?: string;
};

const circleClasses: Record<PathNodeState, string> = {
  locked: 'border-border bg-surface-2 text-text-muted',
  available: 'border-primary/40 bg-surface text-primary',
  current: 'border-primary bg-primary text-primary-foreground',
  done: 'border-success/40 bg-success/10 text-success',
};

const buttonClasses: Record<PathNodeState, string> = {
  locked: 'border-border bg-surface-2 text-text-muted',
  available: 'border-border bg-surface text-text hover:border-primary/40 hover:bg-primary-soft',
  current: 'border-primary bg-primary-soft text-text',
  done: 'border-border bg-surface text-text',
};

/**
 * One node on the vertical module path (PRD §12.7). Locked nodes stay visible
 * but muted and disabled; the accessible name always states the status so the
 * component never relies on colour alone.
 */
export function PathNode({
  number,
  title,
  minutes,
  state,
  onSelect,
  className,
}: PathNodeProps) {
  const t = useTranslations('module.path');
  const stateLabel = t(`states.${state}`);
  const label = t('nodeAria', { number, title, state: stateLabel });
  const locked = state === 'locked';

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'relative flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-full)] border text-small font-semibold tabular-nums',
          circleClasses[state],
        )}
      >
        {number}
        {state === 'done' ? (
          <span className="bg-success text-primary-foreground absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-[var(--radius-full)]">
            <CheckIcon className="size-3" />
          </span>
        ) : null}
      </span>

      <button
        type="button"
        aria-label={label}
        aria-current={state === 'current' ? 'step' : undefined}
        disabled={locked}
        onClick={locked ? undefined : () => onSelect?.(number)}
        className={cn(
          'min-h-11 min-w-0 flex-1 rounded-[var(--radius-card)] border px-4 py-1.5 text-left transition-colors duration-fast ease-out-soft focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed',
          buttonClasses[state],
        )}
      >
        <span className="text-small block truncate font-semibold">{title}</span>
        <span className="text-caption text-text-muted block tabular-nums">
          {t('minutes', { minutes })}
        </span>
      </button>
    </div>
  );
}

export type ModulePathNode = {
  id?: string;
  title: string;
  minutes: number;
  state: PathNodeState;
};

type ModulePathProps = {
  nodes: ModulePathNode[];
  onSelect?: (index: number) => void;
  label?: string;
  className?: string;
};

/**
 * Vertical path wrapper: renders the ordered nodes and the connecting line
 * (E4-01). The line is decorative, so it is hidden from assistive technology.
 */
export function ModulePath({ nodes, onSelect, label, className }: ModulePathProps) {
  const t = useTranslations('module.path');

  return (
    <ol aria-label={label ?? t('listAria')} className={cn('flex flex-col gap-3', className)}>
      {nodes.map((node, index) => (
        <li key={node.id ?? `${index}-${node.title}`} className="relative">
          {index < nodes.length - 1 ? (
            <span
              aria-hidden="true"
              className="bg-border absolute top-12 bottom-[-0.75rem] left-6 w-px"
            />
          ) : null}
          <PathNode
            number={index + 1}
            title={node.title}
            minutes={node.minutes}
            state={node.state}
            onSelect={() => onSelect?.(index)}
          />
        </li>
      ))}
    </ol>
  );
}
