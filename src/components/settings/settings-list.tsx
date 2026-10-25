'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  BellIcon,
  BotIcon,
  ChevronRightIcon,
  CreditCardIcon,
  PaletteIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type SettingsRow = {
  labelKey:
    'learningProfile' | 'appearance' | 'aiModel' | 'subscription' | 'notifications' | 'privacy';
  descriptionKey:
    | 'learningProfileDescription'
    | 'appearanceDescription'
    | 'aiModelDescription'
    | 'subscriptionDescription'
    | 'notificationsDescription'
    | 'privacyDescription';
  icon: LucideIcon;
  href?: string;
};

const rows: SettingsRow[] = [
  {
    labelKey: 'learningProfile',
    descriptionKey: 'learningProfileDescription',
    icon: UserRoundIcon,
    href: '/settings/profil-belajar',
  },
  {
    labelKey: 'appearance',
    descriptionKey: 'appearanceDescription',
    icon: PaletteIcon,
    href: '/settings/tampilan',
  },
  {
    labelKey: 'aiModel',
    descriptionKey: 'aiModelDescription',
    icon: BotIcon,
  },
  {
    labelKey: 'subscription',
    descriptionKey: 'subscriptionDescription',
    icon: CreditCardIcon,
  },
  {
    labelKey: 'notifications',
    descriptionKey: 'notificationsDescription',
    icon: BellIcon,
  },
  {
    labelKey: 'privacy',
    descriptionKey: 'privacyDescription',
    icon: ShieldCheckIcon,
  },
];

/** E15-02: the Settings hub. Only learning profile and appearance are live in M2. */
export function SettingsList() {
  const t = useTranslations('settings');

  return (
    <ul className="border-border bg-surface divide-border flex flex-col divide-y rounded-[var(--radius-card)] border">
      {rows.map((row) => {
        const Icon = row.icon;
        const content = (
          <>
            <span className="bg-surface-2 text-text-muted flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-full)]">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-small flex flex-wrap items-center gap-2 font-semibold">
                {t(`rows.${row.labelKey}`)}
                {row.href ? null : <Badge variant="secondary">{t('comingSoon')}</Badge>}
              </span>
              <span className="text-caption text-text-muted">
                {t(`rows.${row.descriptionKey}`)}
              </span>
            </span>
            <ChevronRightIcon
              className={cn('text-text-muted size-5 shrink-0', !row.href && 'opacity-40')}
              aria-hidden="true"
            />
          </>
        );

        return (
          <li key={row.labelKey}>
            {row.href ? (
              <Link
                href={row.href}
                className="duration-fast ease-out-soft hover:bg-surface-2 flex min-h-14 items-center gap-3 px-4 py-3 transition-colors"
              >
                {content}
              </Link>
            ) : (
              <div
                aria-disabled="true"
                className="flex min-h-14 cursor-not-allowed items-center gap-3 px-4 py-3 opacity-70"
              >
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
