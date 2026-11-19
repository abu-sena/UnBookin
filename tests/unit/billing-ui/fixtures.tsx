import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/id.json';
import type { SubscriptionOverview } from '@/lib/billing/actions';
import type { DisplayedPlan } from '@/lib/billing/pricing';
import type { PlanLimits } from '@/lib/billing/plan-limits';

export const PLANS: DisplayedPlan[] = [
  { code: 'free', name: 'Gratis', priceIdr: 0, interval: 'month', savingsPct: null },
  { code: 'pro_monthly', name: 'Pro Bulanan', priceIdr: 59000, interval: 'month', savingsPct: null },
  {
    code: 'pro_yearly',
    name: 'Pro Tahunan',
    priceIdr: 449000,
    interval: 'year',
    savingsPct: 37,
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
    savingsPct: 28,
  },
];

export const FREE_OVERVIEW: SubscriptionOverview = {
  planCode: 'free',
  planName: 'Gratis',
  currentPeriodEnd: null,
  daysLeft: null,
  renewSoon: false,
  payments: [],
};

export const PAID_OVERVIEW: SubscriptionOverview = {
  planCode: 'pro_monthly',
  planName: 'Pro Bulanan',
  currentPeriodEnd: '2026-12-19T08:00:00.000Z',
  daysLeft: 30,
  renewSoon: false,
  payments: [
    {
      id: 'pay-1',
      date: '2026-11-19T08:00:00.000Z',
      planName: 'Pro Bulanan',
      amountIdr: 59000,
      status: 'paid',
    },
    {
      id: 'pay-2',
      date: '2026-11-18T08:00:00.000Z',
      planName: 'Pro Bulanan',
      amountIdr: 59000,
      status: 'pending',
    },
  ],
};

export const LIMITS: PlanLimits = {
  unbooksPerMonth: 2,
  unbooksFairUse: 2,
  maxPagesPerSource: 60,
  maxFileMb: 20,
  mentorMessagesPerMonth: 20,
  originalsAccess: 'sample',
  modelTier: 'economy',
};

export function wrap(node: ReactNode) {
  return (
    <NextIntlClientProvider locale="id" messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}