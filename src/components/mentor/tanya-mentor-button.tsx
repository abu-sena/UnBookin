'use client';

import dynamic from 'next/dynamic';
import { MessageCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function MentorSheetLoading() {
  const t = useTranslations('mentor');
  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        role="status"
        aria-busy="true"
        aria-label={t('loadingAria')}
        className="border-border bg-surface flex w-full max-w-lg flex-col gap-3 rounded-[var(--radius-sheet)] border p-4"
      >
        <p className="text-small text-text-muted">{t('loading')}</p>
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

const MentorChatSheet = dynamic(
  () => import('./mentor-chat-sheet').then((module) => module.MentorChatSheet),
  { ssr: false, loading: () => <MentorSheetLoading /> },
);

export type TanyaMentorButtonProps = {
  unbookId: string;
  moduleId?: string;
  className?: string;
};

/**
 * Secondary entry point for the mentor sheet (PRD E10-01 AC1). The chat is a
 * separate chunk loaded only after the first tap, so the reader stays light.
 */
export function TanyaMentorButton({ unbookId, moduleId, className }: TanyaMentorButtonProps) {
  const t = useTranslations('mentor');
  const buttonId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setMounted(true);
      return;
    }
    requestAnimationFrame(() => {
      document.getElementById(buttonId)?.focus();
    });
  }

  return (
    <>
      <Button
        id={buttonId}
        type="button"
        variant="outline"
        onClick={() => changeOpen(true)}
        className={className}
      >
        <MessageCircleIcon aria-hidden="true" />
        {t('button')}
      </Button>
      {mounted ? (
        <MentorChatSheet
          open={open}
          onOpenChange={changeOpen}
          unbookId={unbookId}
          moduleId={moduleId}
        />
      ) : null}
    </>
  );
}
