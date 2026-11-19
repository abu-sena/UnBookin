import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronLeftIcon } from 'lucide-react';
import { SubscriptionSettings } from '@/components/billing/subscription-settings';
import { billingErrorKey } from '@/components/billing/format';
import { getSnapClientConfig } from '@/components/billing/server-config';
import { PageHeader } from '@/components/ui-kit/page-header';
import { getSubscriptionOverview } from '@/lib/billing/actions';
import { getDisplayedPlans } from '@/lib/billing/pricing';
import { requireUser } from '@/lib/auth/session';

type LanggananPageProps = {
  searchParams: Promise<{ order?: string | string[] }>;
};

export default async function LanggananPage({ searchParams }: LanggananPageProps) {
  await requireUser('/settings/langganan');
  const [t, billing, params, plans, overview] = await Promise.all([
    getTranslations('settings'),
    getTranslations('billing'),
    searchParams,
    getDisplayedPlans('A'),
    getSubscriptionOverview(),
  ]);
  const config = getSnapClientConfig();
  const orderId = typeof params.order === 'string' && params.order.length <= 50 ? params.order : null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/settings"
        className="text-small text-text-muted hover:text-text inline-flex min-h-11 w-fit items-center gap-1"
      >
        <ChevronLeftIcon className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>
      <PageHeader title={billing('langganan.title')} description={billing('langganan.description')} />
      {overview.ok ? (
        <SubscriptionSettings
          plans={plans}
          overview={overview.data}
          clientKey={config.clientKey}
          snapUrl={config.snapUrl}
          initialOrderId={orderId}
        />
      ) : (
        <p role="alert" className="text-small text-text-muted">
          {billing(billingErrorKey(overview.error))}
        </p>
      )}
    </div>
  );
}