'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui-kit/error-state';

export default function JournalError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('journal.error');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState message={t('message')} retryLabel={t('retry')} onRetry={retry} />;
}
