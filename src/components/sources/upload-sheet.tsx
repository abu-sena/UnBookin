'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileTextIcon, FileUpIcon, LinkIcon } from 'lucide-react';
import { Sheet } from '@/components/layout/sheet';
import { Button } from '@/components/ui/button';
import { sourceInterestSlugFieldSchema, sourceTitleFieldSchema } from '@/lib/sources/schema';
import { cn } from '@/lib/utils';
import type { SourceUploadAdapter, SourceUploadContextState } from './source-action-adapter';
import { UploadContextPanel } from './upload-context-panel';
import { UploadFields } from './upload-fields';
import { UploadFileForm } from './upload-file-form';
import { UploadInlineForm } from './upload-inline-form';

type UploadMode = 'file' | 'url' | 'text';

type UploadSheetProps = {
  open: boolean;
  adapter: SourceUploadAdapter;
  contextState: SourceUploadContextState;
  onRetryContext: () => void;
  onClose: () => void;
  onUploaded: (unbookId: string) => void;
};

const MODES = [
  { key: 'file', icon: FileUpIcon },
  { key: 'url', icon: LinkIcon },
  { key: 'text', icon: FileTextIcon },
] as const;

export function UploadSheet({
  open,
  adapter,
  contextState,
  onRetryContext,
  onClose,
  onUploaded,
}: UploadSheetProps) {
  const t = useTranslations('sources.upload');
  const [mode, setMode] = useState<UploadMode>('file');
  const [title, setTitle] = useState('');
  const [interestSlug, setInterestSlug] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [interestTouched, setInterestTouched] = useState(false);
  const [fileActive, setFileActive] = useState(false);
  const [inlineActive, setInlineActive] = useState(false);
  const [closePrompt, setClosePrompt] = useState(false);
  const [cancelRequest, setCancelRequest] = useState(0);

  const active = fileActive || inlineActive;
  const ready = contextState.status === 'ready' ? contextState.data : null;
  const titleValid = sourceTitleFieldSchema.safeParse(title).success;
  const interestValid =
    sourceInterestSlugFieldSchema.safeParse(interestSlug).success &&
    Boolean(ready?.interests.some((interest) => interest.slug === interestSlug));
  const sharedValid =
    titleValid &&
    interestValid &&
    rightsConfirmed &&
    Boolean(ready) &&
    (ready?.allowance.remaining ?? 0) > 0;

  function resetForm() {
    setMode('file');
    setTitle('');
    setInterestSlug('');
    setRightsConfirmed(false);
    setTitleTouched(false);
    setInterestTouched(false);
    setFileActive(false);
    setInlineActive(false);
    setClosePrompt(false);
  }

  function safeClose() {
    resetForm();
    onClose();
  }

  function handleUploaded(unbookId: string) {
    resetForm();
    onUploaded(unbookId);
  }

  function requestClose() {
    if (active) {
      setClosePrompt(true);
      return;
    }
    safeClose();
  }

  function confirmCancel() {
    setClosePrompt(false);
    if (fileActive) setCancelRequest((value) => value + 1);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
      title={t('title')}
      description={t('description')}
    >
      <div className="flex max-h-[min(70vh,32rem)] min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
        <UploadContextPanel state={contextState} onRetry={onRetryContext} />

        {ready ? (
          <>
            <div role="group" aria-label={t('choicesLabel')} className="grid grid-cols-3 gap-2">
              {MODES.map((item) => {
                const Icon = item.icon;
                const selected = mode === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={selected}
                    disabled={active}
                    onClick={() => setMode(item.key)}
                    className={cn(
                      'duration-fast ease-out-soft flex min-h-14 min-w-0 flex-col items-start justify-center gap-0.5 rounded-[var(--radius-card)] border px-2.5 py-2 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary-soft'
                        : 'border-border bg-surface hover:bg-surface-2',
                      active && 'opacity-50',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="text-caption font-medium break-words">
                      {t(`modes.${item.key}`)}
                    </span>
                  </button>
                );
              })}
            </div>

            <UploadFields
              title={title}
              onTitleChange={setTitle}
              onTitleBlur={() => setTitleTouched(true)}
              interests={ready.interests}
              interestSlug={interestSlug}
              onInterestChange={setInterestSlug}
              onInterestBlur={() => setInterestTouched(true)}
              rightsConfirmed={rightsConfirmed}
              onRightsChange={setRightsConfirmed}
              disabled={active}
              titleError={titleTouched && !titleValid ? t('fields.titleError') : undefined}
              interestError={
                interestTouched && !interestValid ? t('fields.interestError') : undefined
              }
            />

            {mode === 'file' ? (
              <UploadFileForm
                adapter={adapter}
                limits={ready.allowance.limits}
                remaining={ready.allowance.remaining}
                title={title}
                interestSlug={interestSlug}
                sharedValid={sharedValid}
                cancelRequest={cancelRequest}
                onActiveChange={setFileActive}
                onUploaded={handleUploaded}
                onCancelled={safeClose}
              />
            ) : (
              <UploadInlineForm
                key={mode}
                mode={mode}
                adapter={adapter}
                limits={ready.allowance.limits}
                remaining={ready.allowance.remaining}
                title={title}
                interestSlug={interestSlug}
                sharedValid={sharedValid}
                onActiveChange={setInlineActive}
                onUploaded={handleUploaded}
              />
            )}

            {ready.interests.length === 0 ? (
              <p className="text-text-muted text-small">{t('context.interestsEmpty')}</p>
            ) : null}
          </>
        ) : null}

        {closePrompt ? (
          <div
            role="alertdialog"
            aria-labelledby="source-upload-close-title"
            className="border-warning/40 bg-warning/10 flex flex-col gap-3 rounded-[var(--radius-card)] border p-3"
          >
            <h3 id="source-upload-close-title" className="text-h3">
              {t('close.title')}
            </h3>
            <p className="text-small">
              {fileActive ? t('close.fileDescription') : t('close.inlineDescription')}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              {fileActive ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-11 sm:flex-1"
                  onClick={confirmCancel}
                >
                  {t('actions.cancelUpload')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="min-h-11 sm:flex-1"
                onClick={() => setClosePrompt(false)}
              >
                {t('actions.continueUpload')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
