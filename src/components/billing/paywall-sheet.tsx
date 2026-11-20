'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Sheet } from '@/components/layout/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getPaywallConfig, startCheckout } from '@/lib/billing/actions';
import type { DisplayedPlan } from '@/lib/billing/pricing';
import { billingErrorKey } from './format';
import { PlanPicker } from './plan-picker';
import { groupPlans, planCodeFor } from './plans';
import { runSnapCheckout, type SnapClientConfig } from './snap-checkout';

type PaywallSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Server-provided data; when absent the sheet asks the server on first open. */
  plans?: DisplayedPlan[];
  clientKey?: string | null;
  snapUrl?: string;
  currentPlanCode?: string | null;
  /** `/dev/ui` only: never touch server actions or Midtrans. */
  demo?: boolean;
};

function firstPaidCode(plans: DisplayedPlan[]): string {
  const family = groupPlans(plans).find((item) => item.family !== 'free');
  return family ? planCodeFor(family.family, 'month') : 'pro_monthly';
}

/**
 * Alur D paywall: short plan comparison plus the checkout flow. It can be
 * opened from any quota-empty notice without the caller knowing server data.
 */
export function PaywallSheet({
  open,
  onOpenChange,
  plans: plansProp,
  clientKey: clientKeyProp,
  snapUrl: snapUrlProp,
  currentPlanCode,
  demo = false,
}: PaywallSheetProps) {
  const t = useTranslations('billing');
  const [plans, setPlans] = useState<DisplayedPlan[] | null>(plansProp ?? null);
  const [config, setConfig] = useState<SnapClientConfig | null>(
    plansProp && clientKeyProp !== undefined && snapUrlProp
      ? { clientKey: clientKeyProp ?? null, snapUrl: snapUrlProp }
      : null,
  );
  const [selected, setSelected] = useState<string>(() =>
    plansProp ? firstPaidCode(plansProp) : 'pro_monthly',
  );
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || plansProp) return;
    let cancelled = false;
    void getPaywallConfig().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPlans(result.data.plans);
      setConfig({ clientKey: result.data.clientKey, snapUrl: result.data.snapUrl });
      setSelected(firstPaidCode(result.data.plans));
    });
    return () => {
      cancelled = true;
    };
  }, [open, plansProp]);

  async function pay() {
    if (!config || selected === 'free' || paying || demo) return;
    setPaying(true);
    setError(null);
    const result = await startCheckout({ planCode: selected });
    if (!result.ok) {
      setError(result.error);
      setPaying(false);
      return;
    }
    const returnPath =
      typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
    const outcome = await runSnapCheckout(result.data, config, returnPath);
    if (outcome === 'scriptFailed') setError('midtransUnavailable');
    setPaying(false);
  }

  const missingKey = Boolean(config && !config.clientKey);

  const footer = plans ? (
    <>
      {error ? (
        <p role="alert" className="text-danger text-small">
          {t(billingErrorKey(error))}
        </p>
      ) : null}
      <Button
        type="button"
        className="min-h-12 w-full"
        onClick={() => void pay()}
        disabled={paying || missingKey || selected === 'free'}
      >
        {paying ? t('paywall.processing') : t('paywall.pay')}
      </Button>
      <p className="text-caption text-text-muted text-center">{t('paywall.secure')}</p>
    </>
  ) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('paywall.title')}
      description={t('paywall.description')}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        {!plans && !error ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-11 w-48" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : null}
        {!plans && error ? (
          <p role="alert" className="text-danger text-small">
            {t(billingErrorKey(error))}
          </p>
        ) : null}
        {plans ? (
          <>
            <PlanPicker
              plans={plans}
              currentPlanCode={currentPlanCode}
              value={selected}
              onChange={setSelected}
              disabled={paying || missingKey}
              idPrefix="paywall-plan"
            />
            {missingKey ? (
              <p className="border-border bg-surface-2 text-text-muted text-small rounded-[var(--radius-card)] border p-3">
                {t('paywall.missingClientKey')}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Sheet>
  );
}