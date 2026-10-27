'use client';

import { useCallback, useState } from 'react';
import { SourceRef, type SourceExcerpt } from '@/components/module/source-ref';
import { getSourceExcerpt } from '@/lib/learning/actions';

export type SourceExcerptRefProps = {
  moduleId: string;
  chunkId: string;
};

/** E4-02 AC4: a chunk chip that loads its short excerpt on first open. */
export function SourceExcerptRef({ moduleId, chunkId }: SourceExcerptRefProps) {
  const [excerpt, setExcerpt] = useState<SourceExcerpt>({ status: 'loading' });
  const [page, setPage] = useState<number | undefined>(undefined);

  const load = useCallback(async () => {
    setExcerpt({ status: 'loading' });
    try {
      const result = await getSourceExcerpt({ moduleId, chunkId });
      if (!result.ok) {
        setExcerpt({ status: 'error' });
        return;
      }
      setPage(result.pageFrom ?? undefined);
      setExcerpt({
        status: 'ready',
        excerpt: result.text,
        pageFrom: result.pageFrom ?? undefined,
        pageTo: result.pageTo ?? undefined,
      });
    } catch {
      setExcerpt({ status: 'error' });
    }
  }, [moduleId, chunkId]);

  return <SourceRef page={page} excerpt={excerpt} onOpen={load} onRetry={load} />;
}
