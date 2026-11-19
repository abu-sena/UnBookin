'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import {
  getOrderStatus,
  getSubscriptionOverview,
  type SubscriptionOverview,
} from '@/lib/billing/actions';
import type { OrderStatusView } from '@/lib/billing/order-status';
import type { DisplayedPlan } from '@/lib/billing/pricing';
import { formatPeriodDate } from './format';
import { readReturnPath } from './snap-checkout';

export const POLL_INTERVAL_MS = 3_000;
export const MAX_POLLS = 20;

export type OrderPhase = 'waiting' | 'paid' | 'failed' | 'timeout';

type OrderStatusPanelProps = {
  orderId: string;
  plans: DisplayedPlan[];
};

function planNameFor(code: string, plans: DisplayedPlan[]): string {
  return plans.find((plan) => plan.code === code)?.name ?? code;
}

/**
 * E11-02 AC1: poll the server-owned order after returning from Snap. The
 * browser never activates a plan; it only displays what the server reports.
 */
export function OrderStatusPanel({ orderId, plans }: OrderStatusPanelProps) {
  const t = useTranslations('billing');
  const [phase, setPhase] = useState<OrderPhase>('waiting');
  const [view, setView] = useState<OrderStatusView | null>(null);
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const returnPath = useSyncExternalStore(
    () => () => undefined,
    () => readReturnPath(orderId),
    () => null,
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    async function tick() {
      const result = await getOrderStatus({ orderId });
      if (cancelled) return;
      if (result.ok) {
        if (result.data.status === 'paid') {
          setView(result.data);
          setPhase('paid');
          const fresh = await getSubscriptionOverview();
          if (!cancelled && fresh.ok) setOverview(fresh.data);
          return;
        }
        if (result.data.status === 'failed') {
          setPhase('failed');
          return;
        }
      }
      attempts += 1;
      if (attempts >= MAX_POLLS) {
        setPhase('timeout');
        return;
      }
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, pollKey]);

  function retry() {
    setPhase('waiting');
    setView(null);
    setPollKey((value) => value + 1);
  }

  const planName = view ? planNameFor(view.planCode, plans) : '';
  const periodEnd = overview?.currentPeriodEnd ?? null;

  return (
    <section
      aria-live="polite"
      className="border-border bg-surface-2 flex flex-col gap-3 rounded-[var(--radius-card)] border p-4"
      data-phase={phase}
    >
      <p className="text-small font-semibold">
        {phase === 'waiting'
          ? t('langganan.order.waitingTitle')
          : phase === 'paid'
            ? t('langganan.order.paidTitle')
            : phase === 'failed'
              ? t('langganan.order.failedTitle')
              : t('langganan.order.timeoutTitle')}
      </p>
      <p className="text-small text-text-muted">
        {phase === 'waiting'
          ? t('langganan.order.waitingBody')
          : phase === 'paid'
            ? periodEnd
              ? t('langganan.order.paidBody', {
                  plan: planName,
                  date: formatPeriodDate(periodEnd),
                })
              : planName
            : phase === 'failed'
              ? t('langganan.order.failedBody')
              : t('langganan.order.timeoutBody')}
      </p>
      {phase === 'paid' && returnPath ? (
        <Button asChild variant="outline" className="min-h-11 self-start">
          <Link href={returnPath}>{t('langganan.order.backTo', { path: returnPath })}</Link>
        </Button>
      ) : null}
      {phase === 'failed' || phase === 'timeout' ? (
        <Button type="button" variant="outline" className="min-h-11 self-start" onClick={retry}>
          {t('langganan.order.retry')}
        </Button>
      ) : null}
    </section>
  );
}