'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui-kit/error-state';

export default function LibraryError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('library');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState message={t('error.message')} retryLabel={t('error.retry')} onRetry={retry} />;
}
