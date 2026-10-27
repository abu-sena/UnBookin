'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui-kit/error-state';

export default function UnbookError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('sources.progress');

  // The raw error may contain private data; only the safe localized copy is
  // rendered and nothing is logged.
  return <ErrorState message={t('error.message')} retryLabel={t('error.retry')} onRetry={retry} />;
}
