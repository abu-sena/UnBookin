import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronLeftIcon } from 'lucide-react';
import { ByokSettings } from '@/components/byok/byok-settings';
import type { ByokStatusView } from '@/components/byok/byok-status-card';
import { PageHeader } from '@/components/ui-kit/page-header';
import { getByokStatus } from '@/lib/byok/actions';
import { requireUser } from '@/lib/auth/session';

type ModelAiPageProps = {
  searchParams: Promise<{ byok?: string | string[] }>;
};

const DISCONNECTED: ByokStatusView = {
  connected: false,
  last4: null,
  via: null,
  verifiedAt: null,
};

export default async function ModelAiPage({ searchParams }: ModelAiPageProps) {
  await requireUser('/settings/model-ai');
  const [t, params, statusResult] = await Promise.all([
    getTranslations('byokSettings'),
    searchParams,
    getByokStatus(),
  ]);

  const status: ByokStatusView =
    statusResult.ok && statusResult.data.connected
      ? {
          connected: true,
          last4: statusResult.data.last4,
          via: statusResult.data.via,
          verifiedAt: statusResult.data.verifiedAt
            ? statusResult.data.verifiedAt.toISOString()
            : null,
        }
      : DISCONNECTED;

  const result =
    params.byok === 'connected' ? 'connected' : params.byok === 'failed' ? 'failed' : null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/settings"
        className="text-small text-text-muted hover:text-text inline-flex min-h-11 w-fit items-center gap-1"
      >
        <ChevronLeftIcon className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>
      <PageHeader title={t('title')} description={t('description')} />
      <ByokSettings status={status} result={result} />
    </div>
  );
}