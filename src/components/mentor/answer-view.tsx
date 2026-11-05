'use client';

import { useCallback, useId, useState } from 'react';
import { BookOpenIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SourceExcerpt } from '@/components/module/source-ref';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnswerSegment } from '@/lib/mentor/answer';
import { getMentorCitationExcerpt } from '@/lib/mentor/actions';
import { AnswerBody, type AnswerCitationSegment } from './answer-body';

/**
 * A citation opens its quote inline, right under the chip. The mentor already fills the screen as a
 * sheet, and a second sheet stacked on top of it never opened reliably on phones.
 */
function CitationChip({
  threadId,
  citation,
}: {
  threadId: string;
  citation: AnswerCitationSegment;
}) {
  const t = useTranslations('module.source');
  const panelId = useId();
  const [open, setOpen] = useState(false);
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

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && excerpt.status !== 'ready') load();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <BookOpenIcon aria-hidden="true" />
        {citation.page === null
          ? t('chipFallback')
          : t('chipWithPage', { page: citation.page })}
      </Button>
      {open ? (
        <span
          id={panelId}
          role="region"
          aria-label={t('sheetTitle')}
          className="border-border bg-surface my-2 block rounded-[var(--radius-card)] border p-3"
        >
          {excerpt.status === 'loading' ? (
            <span className="flex flex-col gap-2" aria-busy="true">
              <span className="sr-only">{t('loading')}</span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </span>
          ) : null}
          {excerpt.status === 'error' ? (
            <span className="flex flex-col items-start gap-2">
              <span role="alert" className="text-small text-text-muted">
                {t('error')}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={load}>
                {t('retry')}
              </Button>
            </span>
          ) : null}
          {excerpt.status === 'ready' ? (
            <span className="flex flex-col gap-1">
              <q className="text-small block break-words italic">{excerpt.excerpt}</q>
              <span className="text-caption text-text-muted">{pageLabel(excerpt, t)}</span>
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

function pageLabel(
  excerpt: Extract<SourceExcerpt, { status: 'ready' }>,
  t: ReturnType<typeof useTranslations<'module.source'>>,
): string {
  const { pageFrom, pageTo } = excerpt;
  if (pageFrom !== undefined && pageTo !== undefined && pageTo !== pageFrom) {
    return t('pageRange', { from: pageFrom, to: pageTo });
  }
  const page = pageFrom ?? pageTo;
  return page === undefined ? t('noPage') : t('pageSingle', { page });
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
