'use client';

import { useEffect } from 'react';

export const READING_SIZE_STORAGE_KEY = 'ub_reading_size';

export const READING_SIZES = ['small', 'medium', 'large'] as const;
export type ReadingSize = (typeof READING_SIZES)[number];

export const DEFAULT_READING_SIZE: ReadingSize = 'medium';

export function isReadingSize(value: string | null): value is ReadingSize {
  return value !== null && (READING_SIZES as readonly string[]).includes(value);
}

/** Reads the per-device reading size; storage access may throw in private mode. */
export function readStoredReadingSize(): ReadingSize {
  try {
    const value = window.localStorage.getItem(READING_SIZE_STORAGE_KEY);
    return isReadingSize(value) ? value : DEFAULT_READING_SIZE;
  } catch {
    return DEFAULT_READING_SIZE;
  }
}

export function applyReadingSize(size: ReadingSize) {
  document.documentElement.dataset.readingSize = size;
}

/** Applies and persists the reading size; storage access may throw in private mode. */
export function saveReadingSize(size: ReadingSize) {
  applyReadingSize(size);
  try {
    window.localStorage.setItem(READING_SIZE_STORAGE_KEY, size);
  } catch {
    /* The attribute still applies for this page view. */
  }
}

/**
 * E4-02 AC8: applies the stored reading size to `<html>` on mount and keeps it
 * in sync across tabs. Rendered once from the app shell.
 */
export function ReadingSizeSync() {
  useEffect(() => {
    applyReadingSize(readStoredReadingSize());

    const onStorage = (event: StorageEvent) => {
      if (event.key !== READING_SIZE_STORAGE_KEY) return;
      applyReadingSize(isReadingSize(event.newValue) ? event.newValue : DEFAULT_READING_SIZE);
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return null;
}
