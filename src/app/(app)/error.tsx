'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui-kit/error-state';

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState message={t('genericMessage')} retryLabel={t('retry')} onRetry={retry} />;
}
