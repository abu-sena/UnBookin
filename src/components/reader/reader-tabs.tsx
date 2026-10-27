'use client';

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { READER_TABS, type ReaderTab } from './reader-storage';

export type ReaderTabsProps = {
  active: ReaderTab;
  onActiveChange: (tab: ReaderTab) => void;
  panels: Record<ReaderTab, ReactNode>;
  scrollerRef: RefObject<HTMLDivElement | null>;
};

/**
 * E4-02 AC1: the fixed Pahami · Terapkan · Buktikan tabs and the swipeable
 * scroll-snap panels. The tab list and the horizontal scroller stay in sync in
 * both directions and the tabs keep a roving, keyboard-accessible focus.
 */
export function ReaderTabs({ active, onActiveChange, panels, scrollerRef }: ReaderTabsProps) {
  const t = useTranslations('reader.module');
  const baseId = useId().replace(/:/g, '');
  const tablistRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const left = READER_TABS.indexOf(active) * scroller.clientWidth;
    if (Math.abs(scroller.scrollLeft - left) <= 1) return;
    if (typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ left, behavior: 'smooth' });
    } else {
      scroller.scrollLeft = left;
    }
  }, [active, scrollerRef]);

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;
    const index = Math.round(scroller.scrollLeft / scroller.clientWidth);
    const next = READER_TABS[Math.min(READER_TABS.length - 1, Math.max(0, index))];
    if (next && next !== active) onActiveChange(next);
  }

  function focusTab(tab: ReaderTab) {
    tablistRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [READER_TABS.indexOf(tab)]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = READER_TABS.indexOf(active);
    let next: ReaderTab | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = READER_TABS[(index + 1) % READER_TABS.length];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = READER_TABS[(index + READER_TABS.length - 1) % READER_TABS.length];
    } else if (event.key === 'Home') {
      next = READER_TABS[0];
    } else if (event.key === 'End') {
      next = READER_TABS[READER_TABS.length - 1];
    }
    if (!next) return;
    event.preventDefault();
    onActiveChange(next);
    focusTab(next);
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="border-border bg-background/95 sticky top-14 z-30 -mx-4 border-b px-4 py-2 backdrop-blur">
        <div
          ref={tablistRef}
          role="tablist"
          aria-label={t('tabsLabel')}
          aria-orientation="horizontal"
          className="bg-surface-2 flex w-full items-center gap-1 rounded-[var(--radius-button)] p-1"
        >
          {READER_TABS.map((tab) => {
            const selected = tab === active;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${tab}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onActiveChange(tab)}
                onKeyDown={onKeyDown}
                className={cn(
                  'text-small duration-fast ease-out-soft focus-visible:ring-ring/50 min-h-11 flex-1 rounded-[var(--radius-button)] px-3 font-medium transition-colors focus-visible:ring-[3px] focus-visible:outline-none',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'text-text-muted hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {t(`tabs.${tab}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollerRef}
        data-slot="reader-panels"
        onScroll={handleScroll}
        className="flex w-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
      >
        {READER_TABS.map((tab) => (
          <section
            key={tab}
            role="tabpanel"
            id={`${baseId}-panel-${tab}`}
            aria-labelledby={`${baseId}-tab-${tab}`}
            tabIndex={0}
            className="w-full min-w-0 shrink-0 snap-start snap-always pt-4 pb-2 focus-visible:outline-none"
          >
            {panels[tab]}
          </section>
        ))}
      </div>
    </div>
  );
}
