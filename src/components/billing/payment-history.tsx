'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { formatIdr } from '@/lib/format';
import type { SubscriptionPaymentView } from '@/lib/billing/actions';
import { formatPeriodDate } from './format';

/** E11-02 AC4: recent payments, no raw Midtrans fields. */
export function PaymentHistory({ payments }: { payments: SubscriptionPaymentView[] }) {
  const t = useTranslations('billing');

  if (payments.length === 0) {
    return <p className="text-small text-text-muted">{t('langganan.historyEmpty')}</p>;
  }

  return (
    <ul className="border-border bg-surface divide-border flex flex-col divide-y rounded-[var(--radius-card)] border">
      {payments.map((payment) => (
        <li key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-small font-semibold">{payment.planName}</span>
            <span className="text-caption text-text-muted">
              {formatPeriodDate(payment.date)}
            </span>
          </div>
          <span className="text-small tabular-nums">{formatIdr(payment.amountIdr)}</span>
          <Badge
            variant={
              payment.status === 'paid'
                ? 'secondary'
                : payment.status === 'failed'
                  ? 'destructive'
                  : 'outline'
            }
          >
            {t(`langganan.status.${payment.status}`)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}