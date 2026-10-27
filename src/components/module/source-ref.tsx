'use client';

import { BookOpenIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/layout/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export type SourceExcerpt =
  | { status: 'loading' }
  | { status: 'ready'; excerpt: string; pageFrom?: number; pageTo?: number }
  | { status: 'error' };

export type SourceExcerptSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excerpt: SourceExcerpt;
  /** Called once each time the sheet opens, so the page can fetch the excerpt. */
  onOpen?: () => void;
  onRetry?: () => void;
  title?: string;
  description?: string;
};

function PageLabel({ pageFrom, pageTo }: { pageFrom?: number; pageTo?: number }) {
  const t = useTranslations('module.source');

  if (pageFrom === undefined) {
    return <>{t('noPage')}</>;
  }

  if (pageTo !== undefined && pageTo !== pageFrom) {
    return <>{t('pageRange', { from: pageFrom, to: pageTo })}</>;
  }

  return <>{t('pageSingle', { page: pageFrom })}</>;
}

/**
 * Bottom sheet with a short source excerpt (E4-02 AC4, PRD §12.8). The page
 * owns fetching: `onOpen` fires when the sheet appears and the current
 * loading/ready/error state arrives through `excerpt`.
 */
export function SourceExcerptSheet({
  open,
  onOpenChange,
  excerpt,
  onOpen,
  onRetry,
  title,
  description,
}: SourceExcerptSheetProps) {
  const t = useTranslations('module.source');
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) onOpen?.();
    wasOpen.current = open;
  }, [open, onOpen]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? t('sheetTitle')}
      description={description ?? t('sheetDescription')}
    >
      {excerpt.status === 'loading' ? (
        <div className="flex flex-col gap-3 pb-4" role="status" aria-live="polite">
          <span className="text-small text-text-muted">{t('loading')}</span>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : null}

      {excerpt.status === 'error' ? (
        <div className="flex flex-col gap-3 pb-4" role="alert">
          <p className="text-body text-text-muted">{t('error')}</p>
          {onRetry ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              {t('retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {excerpt.status === 'ready' ? (
        <div className="flex flex-col gap-3 pb-4">
          <blockquote className="border-primary/40 bg-surface-2 text-reading rounded-[var(--radius-input)] border-l-4 px-4 py-3">
            {excerpt.excerpt}
          </blockquote>
          <p className="text-caption text-text-muted">
            <PageLabel pageFrom={excerpt.pageFrom} pageTo={excerpt.pageTo} />
          </p>
        </div>
      ) : null}
    </Sheet>
  );
}

export type SourceRefProps = {
  page?: number;
  excerpt: SourceExcerpt;
  onOpen?: () => void;
  onRetry?: () => void;
  title?: string;
  className?: string;
};

/**
 * "hlm. 42" chip that opens the excerpt sheet. Without a page number the chip
 * falls back to the label "Sumber" (PRD §12.7).
 */
export function SourceRef({ page, excerpt, onOpen, onRetry, title, className }: SourceRefProps) {
  const t = useTranslations('module.source');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="dialog"
        className={className}
        onClick={() => setOpen(true)}
      >
        <BookOpenIcon aria-hidden="true" />
        {page === undefined ? t('chipFallback') : t('chipWithPage', { page })}
      </Button>
      <SourceExcerptSheet
        open={open}
        onOpenChange={setOpen}
        excerpt={excerpt}
        onOpen={onOpen}
        onRetry={onRetry}
        title={title}
      />
    </>
  );
}
