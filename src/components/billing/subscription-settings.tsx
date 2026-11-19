'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { startCheckout, type SubscriptionOverview } from '@/lib/billing/actions';
import type { DisplayedPlan } from '@/lib/billing/pricing';
import { billingErrorKey, formatPeriodDate } from './format';
import { OrderStatusPanel } from './order-status-panel';
import { PaymentHistory } from './payment-history';
import { PlanPicker } from './plan-picker';
import { groupPlans, planCodeFor } from './plans';
import { RenewalBanner } from './renewal-banner';
import { runSnapCheckout } from './snap-checkout';

type SubscriptionSettingsProps = {
  plans: DisplayedPlan[];
  overview: SubscriptionOverview;
  clientKey: string | null;
  snapUrl: string;
  initialOrderId: string | null;
};

function defaultSelection(overview: SubscriptionOverview, plans: DisplayedPlan[]): string {
  if (overview.planCode !== 'free') return overview.planCode;
  const paid = groupPlans(plans).find((family) => family.family !== 'free');
  return paid ? planCodeFor(paid.family, 'month') : 'pro_monthly';
}

/** E11-02 AC4 + Alur D: current plan, renewal, checkout, and payment history. */
export function SubscriptionSettings({
  plans,
  overview,
  clientKey,
  snapUrl,
  initialOrderId,
}: SubscriptionSettingsProps) {
  const t = useTranslations('billing');
  const [selected, setSelected] = useState(() => defaultSelection(overview, plans));
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const periodEnd = overview.currentPeriodEnd;
  const missingKey = !clientKey;

  async function payFor(code: string) {
    if (!clientKey || paying) return;
    setPaying(true);
    setError(null);
    const result = await startCheckout({ planCode: code });
    if (!result.ok) {
      setError(result.error);
      setPaying(false);
      return;
    }
    const returnPath =
      typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
    const outcome = await runSnapCheckout(
      result.data,
      { clientKey, snapUrl },
      returnPath,
    );
    if (outcome === 'scriptFailed') setError('midtransUnavailable');
    setPaying(false);
  }

  return (
    <div className="flex flex-col gap-6">
      {overview.renewSoon && overview.daysLeft !== null ? (
        <RenewalBanner daysLeft={overview.daysLeft} />
      ) : null}

      {initialOrderId ? (
        <OrderStatusPanel orderId={initialOrderId} plans={plans} />
      ) : null}

      <section className="border-border bg-surface flex flex-col gap-2 rounded-[var(--radius-card)] border p-4">
        <p className="text-caption text-text-muted">{t('langganan.currentPlan')}</p>
        <p className="text-h3">{overview.planName}</p>
        {periodEnd ? (
          <p className="text-small text-text-muted">
            {t('langganan.activeUntil', { date: formatPeriodDate(periodEnd) })}
            {overview.daysLeft !== null
              ? ` · ${t('langganan.daysLeft', { days: overview.daysLeft })}`
              : null}
          </p>
        ) : (
          <p className="text-small text-text-muted">{t('langganan.noActive')}</p>
        )}
        {overview.planCode !== 'free' ? (
          <Button
            type="button"
            className="mt-2 min-h-11 w-fit"
            disabled={paying || missingKey}
            onClick={() => void payFor(overview.planCode)}
          >
            {paying ? t('paywall.processing') : t('langganan.renew')}
          </Button>
        ) : null}
      </section>

      <section id="langganan-plan" className="flex flex-col gap-3">
        <div>
          <h2 className="text-h3">{t('langganan.chooseTitle')}</h2>
          <p className="text-small text-text-muted">{t('langganan.chooseDescription')}</p>
        </div>
        <PlanPicker
          plans={plans}
          currentPlanCode={overview.planCode}
          value={selected}
          onChange={setSelected}
          disabled={paying || missingKey}
          idPrefix="langganan-plan"
        />
        {missingKey ? (
          <p className="border-border bg-surface-2 text-text-muted text-small rounded-[var(--radius-card)] border p-3">
            {t('paywall.missingClientKey')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-danger text-small">
            {t(billingErrorKey(error))}
          </p>
        ) : null}
        <Button
          type="button"
          className="min-h-12 w-full"
          disabled={paying || missingKey || selected === overview.planCode || selected === 'free'}
          onClick={() => void payFor(selected)}
        >
          {paying ? t('paywall.processing') : t('paywall.pay')}
        </Button>
        <p className="text-caption text-text-muted">{t('paywall.secure')}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">{t('langganan.historyTitle')}</h2>
        <PaymentHistory payments={overview.payments} />
      </section>
    </div>
  );
}