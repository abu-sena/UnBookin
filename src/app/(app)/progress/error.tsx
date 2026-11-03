'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui-kit/error-state';

export default function ProgressError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('progress.error');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState message={t('message')} retryLabel={t('retry')} onRetry={retry} />;
}
