'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import type { PlanLimits } from '@/lib/billing/plan-limits';
import { sourceFileUploadSchema } from '@/lib/sources/schema';
import type { PrepareSourceUploadResult, SourceErrorCode } from '@/lib/sources/types';
import type { SourceUploadAdapter } from './source-action-adapter';
import { UploadErrorNotice, type UploadRecovery } from './upload-error-notice';
import { sourceFileMimeType, validateSourceFile, type ClientSourceError } from './upload-limits';

type UploadFileFormProps = {
  adapter: SourceUploadAdapter;
  limits: PlanLimits;
  remaining: number;
  title: string;
  interestSlug: string;
  sharedValid: boolean;
  cancelRequest: number;
  onActiveChange: (active: boolean) => void;
  onUploaded: (unbookId: string) => void;
  onCancelled: () => void;
};

type Phase = 'editing' | 'preparing' | 'uploading' | 'finalizing' | 'cancelling';

export function UploadFileForm({
  adapter,
  limits,
  remaining,
  title,
  interestSlug,
  sharedValid,
  cancelRequest,
  onActiveChange,
  onUploaded,
  onCancelled,
}: UploadFileFormProps) {
  const t = useTranslations('sources.upload');
  const [file, setFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<PrepareSourceUploadResult | null>(null);
  const [localError, setLocalError] = useState<ClientSourceError | null>(null);
  const [code, setCode] = useState<SourceErrorCode | null>(null);
  const [recovery, setRecovery] = useState<UploadRecovery | null>(null);
  const [phase, setPhase] = useState<Phase>('editing');
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [, startTransition] = useTransition();

  const preparedRef = useRef<PrepareSourceUploadResult | null>(null);
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const handledCancelRef = useRef(cancelRequest);
  const cancelRef = useRef<() => void>(() => undefined);

  const active = running || prepared !== null || recovery?.kind === 'cleanupFailed';
  useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      generationRef.current += 1;
      abortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (cancelRequest <= 0 || handledCancelRef.current === cancelRequest) return;
    handledCancelRef.current = cancelRequest;
    cancelRef.current();
  }, [cancelRequest]);

  function setPreparedBoth(next: PrepareSourceUploadResult | null) {
    preparedRef.current = next;
    setPrepared(next);
  }

  async function cleanup(current: PrepareSourceUploadResult, generation: number) {
    setPhase('cancelling');
    let result: Awaited<ReturnType<SourceUploadAdapter['cancelFileUpload']>>;
    try {
      result = await adapter.cancelFileUpload({ sourceId: current.sourceId });
    } catch {
      if (generation !== generationRef.current) return;
      setCode('processingFailed');
      setRecovery({ kind: 'cleanupFailed' });
      setPhase('editing');
      return;
    }
    if (generation !== generationRef.current) return;

    if (result.ok || result.error === 'notFound') {
      setPreparedBoth(null);
      setProgress(0);
      setPhase('editing');
      onCancelled();
      return;
    }
    if (result.error === 'invalidInput') {
      setPreparedBoth(null);
      setRecovery({ kind: 'finalized', unbookId: current.unbookId });
      setPhase('editing');
      return;
    }
    setCode(result.error);
    setRecovery({ kind: 'cleanupFailed' });
    setPhase('editing');
  }

  function cancelActive() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    if (runningRef.current) {
      setPhase('cancelling');
      return;
    }
    const current = preparedRef.current;
    if (!current) {
      onCancelled();
      return;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    runningRef.current = true;
    setRunning(true);
    setPhase('cancelling');
    startTransition(async () => {
      try {
        await cleanup(current, generation);
      } finally {
        if (generation === generationRef.current) {
          runningRef.current = false;
          setRunning(false);
        }
      }
    });
  }

  useEffect(() => {
    cancelRef.current = cancelActive;
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    if (!next || runningRef.current) return;
    const error = validateSourceFile(next, limits);
    const current = preparedRef.current;
    if (!current) {
      setFile(next);
      setLocalError(error);
      setCode(null);
      setRecovery(null);
      setProgress(0);
      setPhase('editing');
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    runningRef.current = true;
    setRunning(true);
    startTransition(async () => {
      try {
        const result = await adapter.cancelFileUpload({ sourceId: current.sourceId });
        if (generation !== generationRef.current) return;
        if (result.ok || result.error === 'notFound') {
          setPreparedBoth(null);
          setFile(next);
          setLocalError(error);
          setCode(null);
          setRecovery(null);
          setProgress(0);
          setPhase('editing');
          return;
        }
        if (result.error === 'invalidInput') {
          setPreparedBoth(null);
          setRecovery({ kind: 'finalized', unbookId: current.unbookId });
          return;
        }
        setCode(result.error);
        setRecovery({ kind: 'cleanupFailed' });
      } catch {
        if (generation === generationRef.current) {
          setCode('processingFailed');
          setRecovery({ kind: 'cleanupFailed' });
        }
      } finally {
        if (generation === generationRef.current) {
          runningRef.current = false;
          setRunning(false);
        }
      }
    });
  }

  function submit() {
    if (runningRef.current || !file || localError || !sharedValid) return;
    if (recovery && recovery.kind !== 'queue') return;
    const mimeType = sourceFileMimeType(file);
    if (!mimeType) {
      setLocalError('fileType');
      return;
    }
    const parsed = sourceFileUploadSchema.safeParse({
      title: title.trim(),
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
      interestSlug,
      rightsConfirmed: true as const,
    });
    if (!parsed.success) {
      const touchesFile = parsed.error.issues.some(
        (issue) => issue.path[0] === 'filename' || issue.path[0] === 'mimeType',
      );
      setLocalError(touchesFile ? 'fileType' : 'invalidInput');
      return;
    }

    const input = parsed.data;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    cancelledRef.current = false;
    runningRef.current = true;
    setRunning(true);
    setProgress(0);
    setCode(null);
    setRecovery(null);
    setLocalError(null);

    startTransition(async () => {
      try {
        let current = preparedRef.current;
        if (!current) {
          setPhase('preparing');
          const selected = await adapter.prepareFileUpload(input);
          if (!selected.ok) {
            if (generation === generationRef.current) {
              setCode(selected.error);
              setPhase('editing');
            }
            return;
          }
          if (generation !== generationRef.current) {
            if (cancelledRef.current) {
              await adapter
                .cancelFileUpload({ sourceId: selected.data.sourceId })
                .catch(() => undefined);
            }
            return;
          }
          current = selected.data;
          setPreparedBoth(current);
          if (cancelledRef.current) {
            await cleanup(current, generation);
            return;
          }
        }

        if (cancelledRef.current) {
          await cleanup(current, generation);
          return;
        }

        setPhase('uploading');
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          await adapter.uploadFile({
            url: current.uploadUrl,
            file,
            mimeType: current.mimeType,
            onProgress: (value) => {
              if (generation === generationRef.current) setProgress(value);
            },
            signal: controller.signal,
          });
        } catch {
          if (cancelledRef.current) {
            await cleanup(current, generation);
            return;
          }
          if (generation !== generationRef.current) return;
          setCode('storageUnavailable');
          setPhase('editing');
          return;
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
        }

        if (cancelledRef.current) {
          await cleanup(current, generation);
          return;
        }
        if (generation !== generationRef.current) return;
        setPhase('finalizing');
        const completed = await adapter.completeFileUpload({ sourceId: current.sourceId });
        if (generation !== generationRef.current) {
          if (!completed.ok && cancelledRef.current) {
            await adapter.cancelFileUpload({ sourceId: current.sourceId }).catch(() => undefined);
          }
          return;
        }

        if (cancelledRef.current) {
          if (completed.ok) {
            setPreparedBoth(null);
            setRecovery({ kind: 'finalized', unbookId: completed.data.unbookId });
            setPhase('editing');
            return;
          }
          await cleanup(current, generation);
          return;
        }

        if (!completed.ok) {
          setCode(completed.error);
          if (completed.error === 'jobsUnavailable' || completed.error === 'processingFailed') {
            setRecovery({ kind: 'queue' });
          }
          setPhase('editing');
          return;
        }

        setPreparedBoth(null);
        setPhase('editing');
        onUploaded(completed.data.unbookId);
      } catch {
        if (generation === generationRef.current) {
          setCode('processingFailed');
          setPhase('editing');
        }
      } finally {
        if (generation === generationRef.current) {
          runningRef.current = false;
          setRunning(false);
        }
      }
    });
  }

  const phaseLabel =
    phase === 'preparing'
      ? t('fields.preparing')
      : phase === 'uploading'
        ? t('fields.uploading')
        : phase === 'finalizing'
          ? t('fields.finalizing')
          : phase === 'cancelling'
            ? t('fields.cancelling')
            : null;
  const showProgress = phase === 'uploading' || phase === 'finalizing';
  const showCancel = running || (prepared !== null && recovery === null);
  const retryableQueue = recovery?.kind === 'queue';
  const submitDisabled =
    running ||
    !file ||
    Boolean(localError) ||
    !sharedValid ||
    (recovery !== null && !retryableQueue);
  const submitLabel = phaseLabel ?? (code ? t('actions.retry') : t('actions.submit'));

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="source-upload-file">{t('fields.file')}</Label>
        <Input
          id="source-upload-file"
          type="file"
          accept=".pdf,.epub,application/pdf,application/epub+zip"
          onChange={handleFileChange}
          disabled={running}
          className="min-h-11 py-2"
          aria-describedby="source-upload-file-hint"
        />
        <p id="source-upload-file-hint" className="text-text-muted text-small">
          {t('fields.fileHint', { size: limits.maxFileMb })}
        </p>
        {file ? (
          <p className="text-small min-w-0 break-words">
            {t('fields.fileSelected', {
              name: file.name,
              size: (file.size / (1024 * 1024)).toFixed(1),
            })}
          </p>
        ) : null}
      </div>

      {phaseLabel ? (
        <p role="status" aria-live="polite" className="text-small text-text-muted">
          {phaseLabel}
        </p>
      ) : null}

      {showProgress ? (
        <div className="flex flex-col gap-1.5">
          <Progress
            value={progress}
            aria-label={t('fields.progressLabel')}
            aria-valuetext={t('fields.progressValue', { percent: progress })}
          />
          <p className="text-caption text-text-muted tabular-nums" aria-live="polite">
            {t('fields.progressValue', { percent: progress })}
          </p>
        </div>
      ) : null}

      <UploadErrorNotice
        code={code}
        localError={localError}
        limits={limits}
        remaining={remaining}
        recovery={recovery}
        onRetryCleanup={cancelActive}
      />

      <div className="flex flex-col gap-2">
        <Button type="submit" className="min-h-12 w-full" disabled={submitDisabled}>
          {submitLabel}
        </Button>
        {showCancel ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            onClick={cancelActive}
            disabled={phase === 'cancelling' && !running}
          >
            {t('actions.cancelUpload')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
