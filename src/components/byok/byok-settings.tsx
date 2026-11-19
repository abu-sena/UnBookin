'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Sheet } from '@/components/layout/sheet';
import { Button } from '@/components/ui/button';
import { disconnectByok, retestByok } from '@/lib/byok/actions';
import { ByokStatusCard, type ByokStatusView } from './byok-status-card';
import { ManualKeyForm } from './manual-key-form';

type ByokResult = 'connected' | 'failed' | null;

type ByokSettingsProps = {
  status: ByokStatusView;
  result: ByokResult;
};

/** E12 settings: OAuth link, manual key, retest, and disconnect with confirmation. */
export function ByokSettings({ status: initialStatus, result }: ByokSettingsProps) {
  const t = useTranslations('byokSettings');
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function retest() {
    setBusy(true);
    setError(null);
    const response = await retestByok();
    if (response.ok) {
      setStatus((current) => ({
        ...current,
        connected: true,
        verifiedAt: new Date().toISOString(),
      }));
    } else {
      setError(response.error);
    }
    setBusy(false);
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    const response = await disconnectByok();
    if (response.ok) {
      setStatus({ connected: false, last4: null, via: null, verifiedAt: null });
      setConfirmOpen(false);
    } else {
      setError(response.error);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      {result ? (
        <p
          role="status"
          className={
            result === 'connected'
              ? 'border-primary/30 bg-primary-soft text-small rounded-[var(--radius-card)] border p-3'
              : 'border-warning/40 bg-warning/10 text-small rounded-[var(--radius-card)] border p-3'
          }
        >
          {result === 'connected' ? t('result.connected') : t('result.failed')}
        </p>
      ) : null}

      <ByokStatusCard
        status={status}
        busy={busy}
        onRetest={() => void retest()}
        onRequestDisconnect={() => setConfirmOpen(true)}
      />

      {status.connected ? null : (
        <div className="flex flex-col gap-4">
          <Button asChild className="min-h-11 w-full">
            <Link href="/api/byok/start">{t('connectOpenRouter')}</Link>
          </Button>
          <div className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-4">
            <div>
              <h2 className="text-h3">{t('manualTitle')}</h2>
              <p className="text-small text-text-muted">{t('manualDescription')}</p>
            </div>
            <ManualKeyForm
              onConnected={(last4) =>
                setStatus({ connected: true, last4, via: 'manual', verifiedAt: new Date().toISOString() })
              }
            />
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-danger text-small">
          {t(`errors.${error === 'byokKeyRejected' || error === 'byokKeyMissing' || error === 'invalidInput' ? error : 'generic'}`)}
        </p>
      ) : null}

      <div className="border-border bg-surface-2 flex flex-col gap-2 rounded-[var(--radius-card)] border p-4">
        <p className="text-small">{t('planNote')}</p>
        <p className="text-caption text-text-muted">{t('modelNote')}</p>
      </div>

      <Sheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('disconnectTitle')}
        description={t('disconnectDescription')}
      >
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 w-full"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {busy ? t('disconnecting') : t('disconnectConfirm')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            onClick={() => setConfirmOpen(false)}
          >
            {t('cancel')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}