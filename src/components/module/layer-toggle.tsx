'use client';

import { useId, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export const LAYER_VALUES = ['eli5', 'practitioner', 'expert'] as const;

export type LayerValue = (typeof LAYER_VALUES)[number];

export type LayerToggleProps = {
  value: LayerValue;
  onValueChange: (value: LayerValue) => void;
  /** Optional content per layer; rendered as crossfading panels. */
  layers?: Partial<Record<LayerValue, React.ReactNode>>;
  className?: string;
};

/**
 * Three-position segmented control for module layers (PRD §12.7, E4-02 AC2).
 * Controlled through `value`/`onValueChange`; arrow keys move the selection.
 * Panels crossfade for 200 ms and the global reduced-motion rule makes the
 * swap instant.
 */
export function LayerToggle({ value, onValueChange, layers, className }: LayerToggleProps) {
  const t = useTranslations('module.layerToggle');
  const baseId = useId();
  const tablistRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = LAYER_VALUES.indexOf(value);
    let next: LayerValue | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = LAYER_VALUES[(index + 1) % LAYER_VALUES.length];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = LAYER_VALUES[(index + LAYER_VALUES.length - 1) % LAYER_VALUES.length];
    } else if (event.key === 'Home') {
      next = LAYER_VALUES[0];
    } else if (event.key === 'End') {
      next = LAYER_VALUES[LAYER_VALUES.length - 1];
    }
    if (!next) return;
    event.preventDefault();
    onValueChange(next);
    tablistRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [LAYER_VALUES.indexOf(next)]?.focus();
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        ref={tablistRef}
        role="tablist"
        aria-label={t('label')}
        className="bg-surface-2 flex w-full items-center gap-1 rounded-[var(--radius-button)] p-1"
      >
        {LAYER_VALUES.map((layer) => {
          const selected = layer === value;
          return (
            <button
              key={layer}
              type="button"
              role="tab"
              id={`${baseId}-tab-${layer}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${layer}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(layer)}
              onKeyDown={onKeyDown}
              className={cn(
                'text-small duration-fast ease-out-soft min-h-11 flex-1 rounded-[var(--radius-button)] px-3 font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-muted hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {t(`layers.${layer}`)}
            </button>
          );
        })}
      </div>

      {layers ? (
        <div className="grid">
          {LAYER_VALUES.map((layer) => {
            const selected = layer === value;
            return (
              <div
                key={layer}
                role="tabpanel"
                id={`${baseId}-panel-${layer}`}
                aria-labelledby={`${baseId}-tab-${layer}`}
                aria-hidden={!selected}
                className={cn(
                  'duration-base ease-out-soft transition-opacity [grid-area:1/1]',
                  selected ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
              >
                {layers[layer]}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
