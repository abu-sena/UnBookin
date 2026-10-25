import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  READING_SIZE_STORAGE_KEY,
  ReadingSizeSync,
  saveReadingSize,
} from '@/components/layout/reading-size-sync';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-reading-size');
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('ReadingSizeSync', () => {
  it('writes the stored reading size to the html attribute', () => {
    window.localStorage.setItem(READING_SIZE_STORAGE_KEY, 'large');

    render(<ReadingSizeSync />);

    expect(document.documentElement.dataset.readingSize).toBe('large');
  });

  it('falls back to the medium size when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    render(<ReadingSizeSync />);

    expect(document.documentElement.dataset.readingSize).toBe('medium');

    saveReadingSize('large');
    expect(document.documentElement.dataset.readingSize).toBe('large');
  });
});
