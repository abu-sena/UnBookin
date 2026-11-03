'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import type { MentorAllowanceView } from '@/lib/mentor/protocol';

/** Client-only date label: formatting depends on the browser time zone. */
export function formatResetDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeZone,
  }).format(new Date(iso));
}

function subscribeNever(): () => void {
  return () => undefined;
}

/** True only after hydration, so browser-only date text never mismatches SSR. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

export function isQuotaBlocked(
  allowance: MentorAllowanceView | null,
  quotaExceeded: boolean,
): boolean {
  return quotaExceeded || allowance?.remaining === 0;
}

export function QuotaSummary({ allowance }: { allowance: MentorAllowanceView | null }) {
  const t = useTranslations('mentor');
  if (!allowance) return null;

  return (
    <p className="text-caption text-text-muted tabular-nums">
      {allowance.remaining === null
        ? t('quotaUnlimited')
        : t('quota', { remaining: allowance.remaining })}
    </p>
  );
}

export function QuotaEmptyNotice({ resetsAt }: { resetsAt: string }) {
  const t = useTranslations('mentor');
  const mounted = useMounted();
  const label = mounted ? formatResetDate(resetsAt) : null;

  return (
    <div className="border-border bg-surface-2 flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border p-3">
      <p className="text-small font-semibold">{t('quotaEmpty')}</p>
      {label ? (
        <p className="text-small text-text-muted">{t('quotaReset', { date: label })}</p>
      ) : null}
      <Link
        href="/#harga-title"
        className="text-primary text-small inline-flex min-h-11 w-fit items-center font-semibold hover:underline"
      >
        {t('quotaCta')}
      </Link>
    </div>
  );
}
