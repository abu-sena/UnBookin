'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_READING_SIZE,
  READING_SIZES,
  readStoredReadingSize,
  saveReadingSize,
  type ReadingSize,
} from '@/components/layout/reading-size-sync';

const subscribeToStorage = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

/** E4-02 AC8: per-device font size plus the existing light/dark toggle. */
export function ReaderToolbar() {
  const t = useTranslations('reader.module.toolbar');
  const mounted = useSyncExternalStore(subscribeToStorage, getMounted, getServerMounted);
  const storedSize = useSyncExternalStore(
    subscribeToStorage,
    readStoredReadingSize,
    () => DEFAULT_READING_SIZE,
  );
  const [pendingSize, setPendingSize] = useState<ReadingSize | null>(null);
  const size = pendingSize ?? (mounted ? storedSize : DEFAULT_READING_SIZE);

  function choose(next: ReadingSize) {
    setPendingSize(next);
    saveReadingSize(next);
  }

  return (
    <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-caption text-text-muted shrink-0">{t('readingSizeLabel')}</span>
        <div role="group" aria-label={t('readingSizeLabel')} className="flex items-center gap-1">
          {READING_SIZES.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={size === option ? 'secondary' : 'ghost'}
              aria-pressed={size === option}
              onClick={() => choose(option)}
            >
              {t(`sizes.${option}`)}
            </Button>
          ))}
        </div>
      </div>
      <ThemeToggle />
    </div>
  );
}
