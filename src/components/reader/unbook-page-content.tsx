'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SourceProcessingView } from '@/components/sources/source-processing-view';
import { PageHeader } from '@/components/ui-kit/page-header';
import type { UnbookPath } from '@/lib/learning/queries';
import type { SourceProgress } from '@/lib/sources/types';
import { UnbookPathView } from './unbook-path-view';

export type UnbookPageContentProps = {
  progress: SourceProgress;
  path: UnbookPath | null;
  deleteAction: ReactNode;
};

/** E4-01: keep processing for every non-ready state, render the path once ready. */
export function UnbookPageContent({ progress, path, deleteAction }: UnbookPageContentProps) {
  const t = useTranslations('sources.progress');

  if (progress.unbookStatus === 'ready' && path) {
    return <UnbookPathView path={path} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('page.title')} description={t('page.description')} />
      <SourceProcessingView initialProgress={progress}>{deleteAction}</SourceProcessingView>
    </div>
  );
}
