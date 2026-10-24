'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const LAYER_KEYS = ['sederhana', 'praktisi', 'ahli'] as const;

type LayerKey = (typeof LAYER_KEYS)[number];

/**
 * Static interactive sample module for the landing page (E0-01 AC2).
 * The only client JS in the demo is the 3-position layer toggle: a tablist
 * with crossfading panels (200 ms, disabled under `prefers-reduced-motion`
 * by the global reduced-motion rule in globals.css).
 */
export function ModuleDemo() {
  const t = useTranslations('landing');
  const [active, setActive] = useState<LayerKey>('sederhana');
  const baseId = useId();
  const tablistRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = LAYER_KEYS.indexOf(active);
    let next: LayerKey | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = LAYER_KEYS[(index + 1) % LAYER_KEYS.length];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = LAYER_KEYS[(index + LAYER_KEYS.length - 1) % LAYER_KEYS.length];
    }
    if (!next) return;
    event.preventDefault();
    setActive(next);
    tablistRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [LAYER_KEYS.indexOf(next)]?.focus();
  }

  return (
    <div className="bg-surface border-border rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow-card)] sm:p-6">
      <p className="bg-primary-soft text-primary text-caption inline-block rounded-[var(--radius-input)] px-3 py-1 font-semibold tracking-wide uppercase">
        {t('demo.bigIdeaLabel')}
      </p>
      <p className="text-h3 mt-3">{t('demo.bigIdea')}</p>

      <div
        ref={tablistRef}
        role="tablist"
        aria-label={t('demo.toggleLabel')}
        className="bg-surface-2 mt-5 flex w-full items-center gap-1 rounded-[var(--radius-button)] p-1"
      >
        {LAYER_KEYS.map((key) => {
          const selected = key === active;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${baseId}-tab-${key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(key)}
              onKeyDown={onKeyDown}
              className={cn(
                'text-small duration-fast ease-out-soft min-h-11 flex-1 rounded-[var(--radius-button)] px-3 font-medium transition-colors',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {t(`demo.layers.${key}.label`)}
            </button>
          );
        })}
      </div>

      {/* Stacked panels in one grid cell crossfade via opacity (200 ms). */}
      <div className="mt-4 grid">
        {LAYER_KEYS.map((key) => {
          const selected = key === active;
          return (
            <div
              key={key}
              role="tabpanel"
              id={`${baseId}-panel-${key}`}
              aria-labelledby={`${baseId}-tab-${key}`}
              aria-hidden={!selected}
              data-active={selected ? 'true' : 'false'}
              className={cn(
                'duration-base ease-out-soft transition-opacity [grid-area:1/1]',
                selected ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              <p className="text-reading">{t(`demo.layers.${key}.body`)}</p>
            </div>
          );
        })}
      </div>

      {/* Sample weekly action (PRD §1 "Terapkan" pillar). */}
      <div className="border-border mt-5 rounded-[var(--radius-card)] border border-dashed p-4">
        <p className="text-caption text-success inline-flex items-center gap-1 font-semibold tracking-wide uppercase">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {t('demo.actionCard.label')}
        </p>
        <p className="mt-2 font-semibold">{t('demo.actionCard.title')}</p>
        <p className="text-muted-foreground mt-1">{t('demo.actionCard.body')}</p>
        <p className="text-muted-foreground text-small mt-2 italic">
          {t('demo.actionCard.criteria')}
        </p>
      </div>
    </div>
  );
}
