'use client';

import { useTranslations } from 'next-intl';
import { KeyRoundIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPeriodDate } from '@/components/billing/format';

export type ByokStatusView = {
  connected: boolean;
  last4: string | null;
  via: 'oauth' | 'manual' | null;
  verifiedAt: string | null;
};

type ByokStatusCardProps = {
  status: ByokStatusView;
  busy: boolean;
  onRetest: () => void;
  onRequestDisconnect: () => void;
};

/** E12: key status shows only `last4`, never the key itself. */
export function ByokStatusCard({
  status,
  busy,
  onRetest,
  onRequestDisconnect,
}: ByokStatusCardProps) {
  const t = useTranslations('byokSettings');

  return (
    <section className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-4">
      <div className="flex items-center gap-3">
        <span className="bg-surface-2 text-primary flex size-10 items-center justify-center rounded-[var(--radius-full)]">
          <KeyRoundIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-small font-semibold">
            {status.connected && status.last4
              ? t('status.connected', { last4: status.last4 })
              : t('status.notConnected')}
          </p>
          {status.connected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {status.via === 'oauth' ? t('status.viaOauth') : t('status.viaManual')}
              </Badge>
              <span className="text-caption text-text-muted">
                {status.verifiedAt
                  ? t('status.lastVerified', { date: formatPeriodDate(status.verifiedAt) })
                  : t('status.notVerified')}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {status.connected ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onRetest}>
            {busy ? t('retesting') : t('retest')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-danger min-h-11"
            disabled={busy}
            onClick={onRequestDisconnect}
          >
            {t('disconnect')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}