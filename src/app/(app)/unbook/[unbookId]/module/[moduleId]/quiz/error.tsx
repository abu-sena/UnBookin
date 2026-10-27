'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui-kit/error-state';

export default function QuizError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('quizFlow.error');

  // The raw error may contain private data; only safe localized copy is rendered.
  return <ErrorState message={t('message')} retryLabel={t('retry')} onRetry={retry} />;
}
