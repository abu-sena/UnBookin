'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui-kit/error-state';

export default function LanggananError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('billing');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState message={t('langganan.errors.generic')} retryLabel={t('common.retry')} onRetry={retry} />;
}