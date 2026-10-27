'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SourceRef, type SourceExcerpt } from '@/components/module/source-ref';
import { getSourceExcerpt } from '@/lib/learning/actions';

type QuizSourceLinkProps = {
  moduleId: string;
  chunkId: string;
};

/** AC2: "Lihat di sumber" for the first chunk of the answered question. */
export function QuizSourceLink({ moduleId, chunkId }: QuizSourceLinkProps) {
  const t = useTranslations('module.source');
  const [excerpt, setExcerpt] = useState<SourceExcerpt>({ status: 'loading' });

  async function load() {
    setExcerpt({ status: 'loading' });
    const result = await getSourceExcerpt({ moduleId, chunkId });
    if (!result.ok) {
      setExcerpt({ status: 'error' });
      return;
    }
    setExcerpt({
      status: 'ready',
      excerpt: result.text,
      pageFrom: result.pageFrom ?? undefined,
      pageTo: result.pageTo ?? undefined,
    });
  }

  return (
    <SourceRef
      excerpt={excerpt}
      onOpen={() => void load()}
      onRetry={() => void load()}
      title={t('sheetTitle')}
    />
  );
}
