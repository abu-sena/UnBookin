'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui-kit/error-state';

export default function SettingsError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('settings');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState message={t('errorMessage')} retryLabel={t('retry')} onRetry={retry} />;
}
