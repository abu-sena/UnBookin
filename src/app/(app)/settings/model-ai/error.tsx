'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui-kit/error-state';

export default function ModelAiError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('byokSettings');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState message={t('errors.generic')} retryLabel={t('retry')} onRetry={retry} />;
}