'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from 'lucide-react';
import {
  DEFAULT_READING_SIZE,
  READING_SIZES,
  readStoredReadingSize,
  saveReadingSize,
  type ReadingSize,
} from '@/components/layout/reading-size-sync';

type ThemeValue = 'light' | 'dark' | 'system';

const subscribeToStorage = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

const themeOptions: {
  value: ThemeValue;
  labelKey: 'light' | 'dark' | 'system';
  icon: LucideIcon;
}[] = [
  { value: 'light', labelKey: 'light', icon: SunIcon },
  { value: 'dark', labelKey: 'dark', icon: MoonIcon },
  { value: 'system', labelKey: 'system', icon: MonitorIcon },
];

const readingSizeLabelKeys: Record<ReadingSize, 'small' | 'medium' | 'large'> = {
  small: 'small',
  medium: 'medium',
  large: 'large',
};

/** E4-02 AC8: theme plus the per-device reading font size, with a live preview. */
export function AppearanceSettings() {
  const t = useTranslations('settings');
  const tTheme = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToStorage, getMounted, getServerMounted);
  const [pendingReadingSize, setPendingReadingSize] = useState<ReadingSize | null>(null);
  const storedReadingSize = useSyncExternalStore(
    subscribeToStorage,
    readStoredReadingSize,
    () => DEFAULT_READING_SIZE,
  );
  const readingSize = pendingReadingSize ?? storedReadingSize;

  const currentTheme: ThemeValue = mounted
    ? theme === 'light' || theme === 'dark' || theme === 'system'
      ? theme
      : 'system'
    : 'system';

  function changeReadingSize(size: ReadingSize) {
    setPendingReadingSize(size);
    saveReadingSize(size);
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-h2">{t('appearance.themeTitle')}</legend>
        <p className="text-small text-text-muted">{t('appearance.themeHint')}</p>
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            return (
              <label
                key={option.value}
                className="border-border bg-surface has-checked:border-primary has-checked:bg-primary-soft flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border px-3 py-2 text-center"
              >
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={currentTheme === option.value}
                  onChange={() => setTheme(option.value)}
                  className="sr-only"
                />
                <Icon className="size-5" aria-hidden="true" />
                <span className="text-small">{tTheme(option.labelKey)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-h2">{t('appearance.readingSizeTitle')}</legend>
        <p className="text-small text-text-muted">{t('appearance.readingSizeHint')}</p>
        <div className="grid grid-cols-3 gap-2">
          {READING_SIZES.map((size) => (
            <label
              key={size}
              className="border-border bg-surface has-checked:border-primary has-checked:bg-primary-soft flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-input)] border px-3 py-2"
            >
              <input
                type="radio"
                name="readingSize"
                value={size}
                checked={readingSize === size}
                onChange={() => changeReadingSize(size)}
                className="sr-only"
              />
              <span className="text-small">{t(`appearance.${readingSizeLabelKeys[size]}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="border-border bg-surface flex flex-col gap-2 rounded-[var(--radius-card)] border p-4">
        <h2 className="text-caption text-text-muted uppercase">{t('appearance.previewTitle')}</h2>
        <p className="text-reading">{t('appearance.previewText')}</p>
      </section>
    </div>
  );
}
