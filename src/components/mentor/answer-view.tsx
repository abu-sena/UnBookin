'use client';

import { useCallback, useState } from 'react';
import { SourceRef, type SourceExcerpt } from '@/components/module/source-ref';
import type { AnswerSegment } from '@/lib/mentor/answer';
import { getMentorCitationExcerpt } from '@/lib/mentor/actions';
import { AnswerBody, type AnswerCitationSegment } from './answer-body';

function CitationChip({
  threadId,
  citation,
}: {
  threadId: string;
  citation: AnswerCitationSegment;
}) {
  const [excerpt, setExcerpt] = useState<SourceExcerpt>({ status: 'loading' });

  const load = useCallback(() => {
    setExcerpt({ status: 'loading' });
    void getMentorCitationExcerpt({ threadId, chunkId: citation.chunkId })
      .then((result) => {
        if (result.ok) {
          setExcerpt({
            status: 'ready',
            excerpt: result.text,
            pageFrom: result.pageFrom ?? undefined,
            pageTo: result.pageTo ?? undefined,
          });
          return;
        }
        setExcerpt({ status: 'error' });
      })
      .catch(() => setExcerpt({ status: 'error' }));
  }, [threadId, citation.chunkId]);

  return (
    <SourceRef page={citation.page ?? undefined} excerpt={excerpt} onOpen={load} onRetry={load} />
  );
}

export type MentorAnswerProps = {
  segments: readonly AnswerSegment[];
  threadId: string;
  className?: string;
};

/** Answer with tappable source chips (PRD E10-01 AC2), live or from history. */
export function MentorAnswer({ segments, threadId, className }: MentorAnswerProps) {
  return (
    <AnswerBody
      segments={segments}
      className={className}
      renderCitation={(citation) => <CitationChip threadId={threadId} citation={citation} />}
    />
  );
}
