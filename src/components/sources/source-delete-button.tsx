'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2Icon } from 'lucide-react';
import { Sheet } from '@/components/layout/sheet';
import { Button } from '@/components/ui/button';
import { deleteMyUnbook } from '@/lib/sources/actions';
import type { DeletedUnbookResult, SourceActionResult, SourceErrorCode } from '@/lib/sources/types';

/** Exact type of the real server action, so a preview fake stays compatible. */
export type DeleteUnbookAction = typeof deleteMyUnbook;

type SourceDeleteButtonProps = {
  unbookId: string;
  title: string;
  returnToLibrary?: boolean;
  deleteAction?: DeleteUnbookAction;
};

/**
 * Delete control for one owned Unbook: opens the responsive confirmation
 * sheet and only then starts `deleteMyUnbook`. Failures keep the dialog open
 * with a safe localized code; a raw thrown (network) error is sanitized to
 * `processingFailed`. Nothing raw is ever rendered or logged.
 */
export function SourceDeleteButton({
  unbookId,
  title,
  returnToLibrary = false,
  deleteAction,
}: SourceDeleteButtonProps) {
  const t = useTranslations('sources.delete');
  const router = useRouter();
  // Only an explicitly injected fake may replace the real action (preview).
  const deleteUnbook = deleteAction ?? deleteMyUnbook;

  const [open, setOpen] = useState(false);
  const [errorCode, setErrorCode] = useState<SourceErrorCode | null>(null);
  const [isPending, startTransition] = useTransition();
  // Synchronous duplicate guard: held while a delete request is in flight.
  const deleteInFlightRef = useRef(false);

  const confirmDelete = () => {
    if (deleteInFlightRef.current) return;
    deleteInFlightRef.current = true;
    setErrorCode(null);
    startTransition(async () => {
      let result: SourceActionResult<DeletedUnbookResult>;
      try {
        result = await deleteUnbook({ unbookId });
      } catch {
        deleteInFlightRef.current = false;
        setErrorCode('processingFailed');
        return;
      }
      deleteInFlightRef.current = false;
      if (!result.ok) {
        setErrorCode(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      if (returnToLibrary) router.replace('/library');
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="text-danger hover:text-danger focus-visible:text-danger"
        aria-label={t('trigger')}
        title={t('trigger')}
        disabled={isPending}
        onClick={() => {
          setErrorCode(null);
          setOpen(true);
        }}
      >
        <Trash2Icon aria-hidden="true" />
      </Button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!isPending) setOpen(next);
        }}
        title={t('title')}
        description={t('description')}
      >
        <div className="flex w-full min-w-0 flex-col gap-3">
          <p className="text-small font-medium [overflow-wrap:anywhere] break-words">{title}</p>
          {errorCode ? (
            <p role="alert" className="text-danger text-small [overflow-wrap:anywhere] break-words">
              {t(`errors.${errorCode}`)}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={confirmDelete}
            >
              {isPending ? t('pending') : t('confirm')}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
