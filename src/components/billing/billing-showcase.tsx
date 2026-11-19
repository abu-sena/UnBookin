'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ByokStatusCard } from '@/components/byok/byok-status-card';
import { Button } from '@/components/ui/button';
import type { DisplayedPlan } from '@/lib/billing/pricing';
import { PaywallSheet } from './paywall-sheet';
import { PlanPicker } from './plan-picker';
import { RenewalBanner } from './renewal-banner';

const plans: DisplayedPlan[] = [
  { code: 'free', name: 'Gratis', priceIdr: 0, interval: 'month', savingsPct: null },
  {
    code: 'pro_monthly',
    name: 'Pro Bulanan',
    priceIdr: 59000,
    interval: 'month',
    savingsPct: null,
  },
  {
    code: 'pro_yearly',
    name: 'Pro Tahunan',
    priceIdr: 449000,
    interval: 'year',
    savingsPct: sampleSavingsPct(449000, 59000),
  },
  {
    code: 'byok_monthly',
    name: 'Pro BYOK Bulanan',
    priceIdr: 29000,
    interval: 'month',
    savingsPct: null,
  },
  {
    code: 'byok_yearly',
    name: 'Pro BYOK Tahunan',
    priceIdr: 249000,
    interval: 'year',
    savingsPct: sampleSavingsPct(249000, 29000),
  },
];

/** `/dev/ui` data only: no billing action or Midtrans request ever runs here. */
export function BillingShowcase() {
  const t = useTranslations('billing.devUi');
  const order = useTranslations('billing.langganan.order');
  const [selected, setSelected] = useState('pro_monthly');
  const [paywallOpen, setPaywallOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('planPicker')}</h3>
        <PlanPicker
          plans={plans}
          currentPlanCode="free"
          value={selected}
          onChange={setSelected}
          idPrefix="showcase-plan"
        />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('paywall')}</h3>
        <Button type="button" variant="outline" onClick={() => setPaywallOpen(true)}>
          {t('openPaywall')}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('statuses')}</h3>
        {(['waiting', 'paid', 'failed', 'timeout'] as const).map((key) => (
          <div
            key={key}
            className="border-border bg-surface-2 rounded-[var(--radius-card)] border p-3"
          >
            <p className="text-small font-semibold">{order(`${key}Title`)}</p>
            <p className="text-small text-text-muted">{order(`${key}Body`)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('byok')}</h3>
        <ByokStatusCard
          status={{
            connected: true,
            last4: 'abcd',
            via: 'oauth',
            verifiedAt: '2026-11-19T08:00:00.000Z',
          }}
          busy={false}
          onRetest={() => undefined}
          onRequestDisconnect={() => undefined}
        />
        <ByokStatusCard
          status={{
            connected: true,
            last4: 'wxyz',
            via: 'manual',
            verifiedAt: null,
          }}
          busy={false}
          onRetest={() => undefined}
          onRequestDisconnect={() => undefined}
        />
        <ByokStatusCard
          status={{ connected: false, last4: null, via: null, verifiedAt: null }}
          busy={false}
          onRetest={() => undefined}
          onRequestDisconnect={() => undefined}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('banner')}</h3>
        <RenewalBanner daysLeft={3} />
      </div>

      <PaywallSheet
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        plans={plans}
        clientKey="sample-client-key"
        snapUrl="https://app.sandbox.midtrans.com/snap/snap.js"
        demo
      />
    </div>
  );
}

/** Local copy so the client showcase never imports the server-only pricing module. */
function sampleSavingsPct(yearly: number, monthly: number): number | null {
  return monthly > 0 ? Math.round((1 - yearly / (12 * monthly)) * 100) : null;
}