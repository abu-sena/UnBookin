'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { retrySourceProcessing } from '@/lib/sources/actions';
import { SOURCE_ERROR_CODES, type SourceErrorCode } from '@/lib/sources/errors';
import { SOURCE_PROGRESS_STAGES, type SourceProgress } from '@/lib/sources/types';
import { SourceProgressCard } from './source-progress-card';

const POLL_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 10_000;

const SOURCE_STATUS_VALUES = ['uploaded', 'extracting', 'ready', 'failed'] as const;
const UNBOOK_STATUS_VALUES = ['queued', 'outlining', 'generating', 'ready', 'failed'] as const;

function isFailedProgress(progress: SourceProgress): boolean {
  return progress.sourceStatus === 'failed' || progress.unbookStatus === 'failed';
}

/**
 * A terminal actual status always wins over a stale pipeline stage, so a
 * finished or failed flow can never be mistaken for one still processing.
 */
function isTerminalProgress(progress: SourceProgress): boolean {
  if (isFailedProgress(progress) || progress.unbookStatus === 'ready') return true;
  return progress.stage === 'ready' || progress.stage === 'failed';
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isInUnion<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/**
 * Validate the polling payload against the closed unions before it may become
 * state. Anything that does not belong to this exact Unbook or carries an
 * unknown status/stage/error code is rejected whole (never rendered raw).
 */
function parseProgressPayload(payload: unknown, unbookId: string): SourceProgress | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = payload as Record<string, unknown>;

  if (data.unbookId !== unbookId || typeof data.title !== 'string') return null;
  if (data.sourceId !== null && typeof data.sourceId !== 'string') return null;

  const { sourceStatus, unbookStatus, stage } = data;
  if (sourceStatus !== null && !isInUnion(SOURCE_STATUS_VALUES, sourceStatus)) return null;
  if (!isInUnion(UNBOOK_STATUS_VALUES, unbookStatus)) return null;
  if (!isInUnion(SOURCE_PROGRESS_STAGES, stage)) return null;
  if (!isPercent(data.progressPct) || !isCount(data.embeddedChunks) || !isCount(data.totalChunks))
    return null;
  if (data.errorCode !== null && !isInUnion(SOURCE_ERROR_CODES, data.errorCode)) return null;
  if (!isCount(data.moduleCount) || !isCount(data.modulesCompleted)) return null;

  return {
    unbookId,
    title: data.title,
    sourceId: data.sourceId,
    sourceStatus,
    unbookStatus,
    stage,
    progressPct: data.progressPct,
    embeddedChunks: data.embeddedChunks,
    totalChunks: data.totalChunks,
    moduleCount: data.moduleCount,
    modulesCompleted: data.modulesCompleted,
    errorCode: data.errorCode,
  } satisfies SourceProgress;
}

export function SourceProcessingView({
  initialProgress,
  children,
}: {
  initialProgress: SourceProgress;
  children?: ReactNode;
}) {
  // A different Unbook id remounts the poller, so every timer, in-flight
  // request and derived state is torn down instead of leaking across ids.
  return (
    <SourceProcessingPoller key={initialProgress.unbookId} initialProgress={initialProgress}>
      {children}
    </SourceProcessingPoller>
  );
}

function SourceProcessingPoller({
  initialProgress,
  children,
}: {
  initialProgress: SourceProgress;
  children?: ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations('sources.progress');
  const unbookId = initialProgress.unbookId;

  const [progress, setProgress] = useState(initialProgress);
  const [connectionLost, setConnectionLost] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [pollNonce, setPollNonce] = useState(0);
  const [retryErrorCode, setRetryErrorCode] = useState<SourceErrorCode | null>(null);
  const [retryQueued, setRetryQueued] = useState(false);
  const [isRetrying, startRetry] = useTransition();

  const progressRef = useRef(initialProgress);

  useEffect(() => {
    if (removed || signedOut) return;
    // An already-ready/failed flow never starts polling.
    if (pollNonce === 0 && isTerminalProgress(progressRef.current)) return;

    let cancelled = false;
    let controller: AbortController | null = null;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = () => {
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    const tick = async () => {
      // A fresh controller per request: one timed-out poll can never leave a
      // permanently aborted signal behind for the polls that follow it.
      controller = new AbortController();
      // The deadline covers the body read too, not only the response headers.
      requestTimer = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`/api/sources/${encodeURIComponent(unbookId)}`, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
      } catch {
        clearTimeout(requestTimer);
        if (cancelled) return;
        setConnectionLost(true);
        scheduleNext();
        return;
      }
      if (cancelled) return;

      if (response.status === 401) {
        clearTimeout(requestTimer);
        setSignedOut(true);
        router.replace(`/masuk?callbackUrl=${encodeURIComponent(`/unbook/${unbookId}`)}`);
        return;
      }
      if (response.status === 404) {
        clearTimeout(requestTimer);
        setConnectionLost(false);
        setRemoved(true);
        return;
      }

      let payload: unknown = null;
      if (response.ok) {
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
      }
      clearTimeout(requestTimer);
      // The body may finish after unmount; never touch state or re-poll then.
      if (cancelled) return;

      const parsed = response.ok ? parseProgressPayload(payload, unbookId) : null;
      if (!parsed) {
        setConnectionLost(true);
        scheduleNext();
        return;
      }

      progressRef.current = parsed;
      setProgress(parsed);
      setConnectionLost(false);
      // Only a freshly confirmed failure justifies offering the job retry again.
      if (isFailedProgress(parsed)) setRetryQueued(false);
      if (!isTerminalProgress(parsed)) scheduleNext();
    };

    void tick();
    return () => {
      cancelled = true;
      controller?.abort();
      if (requestTimer !== undefined) clearTimeout(requestTimer);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [removed, signedOut, pollNonce, unbookId, router]);

  const reconnect = () => {
    setConnectionLost(false);
    setPollNonce((nonce) => nonce + 1);
  };

  const retryJob = () => {
    if (isRetrying || retryQueued) return;
    setRetryErrorCode(null);
    startRetry(async () => {
      try {
        const result = await retrySourceProcessing({ unbookId });
        if (result.ok) {
          // Accepted: keep polling for the fresh status; a second job retry is
          // suppressed until a real GET confirms the flow failed again.
          setRetryQueued(true);
          setPollNonce((nonce) => nonce + 1);
        } else {
          setRetryErrorCode(result.error);
        }
      } catch {
        // A network-level failure stays a safe, local error code: the failed
        // state is retained and no raw error is rendered or logged.
        setRetryErrorCode('processingFailed');
      }
    });
  };

  if (signedOut) return null;

  if (removed) {
    return (
      <section className="bg-surface border-border flex w-full min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border p-4">
        <p role="alert" className="text-danger text-small break-words">
          {t('removed.message')}
        </p>
        <Button asChild variant="outline" className="self-start">
          <Link href="/library">{t('removed.libraryAction')}</Link>
        </Button>
      </section>
    );
  }

  return (
    <ProcessingProgressCard progress={progress}>
      {connectionLost ? (
        <div role="alert" className="flex w-full min-w-0 flex-col gap-2">
          <p className="text-warning text-small break-words">{t('connection.error')}</p>
          <Button type="button" variant="outline" className="self-start" onClick={reconnect}>
            {t('connection.retry')}
          </Button>
        </div>
      ) : null}
      {isFailedProgress(progress) && !retryQueued ? (
        <div className="flex w-full min-w-0 flex-col gap-2">
          {retryErrorCode ? (
            <p role="alert" className="text-danger text-small break-words">
              {t(`errors.${retryErrorCode}`)}
            </p>
          ) : null}
          <Button type="button" className="self-start" disabled={isRetrying} onClick={retryJob}>
            {isRetrying ? t('retry.pending') : t('retry.action')}
          </Button>
        </div>
      ) : null}
      {!isFailedProgress(progress) && progress.unbookStatus === 'ready' ? (
        <Button asChild className="min-h-11 self-start">
          <Link href={`/unbook/${progress.unbookId}`}>{t('readyAction')}</Link>
        </Button>
      ) : null}
      {children}
    </ProcessingProgressCard>
  );
}

/** Generation labels need real counts; the shared ingest preview stays compatible. */
function ProcessingProgressCard({
  progress,
  children,
}: {
  progress: SourceProgress;
  children: ReactNode;
}) {
  const t = useTranslations('sources.progress');
  const stage = progress.stage;
  if (
    isFailedProgress(progress) ||
    progress.unbookStatus === 'ready' ||
    (stage !== 'outlining' && stage !== 'generating' && stage !== 'tagging')
  ) {
    return <SourceProgressCard progress={progress}>{children}</SourceProgressCard>;
  }
  const label =
    stage === 'generating'
      ? t('modules', { done: progress.modulesCompleted ?? 0, total: progress.moduleCount ?? 0 })
      : t(`stage.${stage}`);
  return (
    <section className="bg-surface border-border flex w-full min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border p-4">
      <h2 className="text-h3 min-w-0 break-words">{progress.title}</h2>
      <p role="status" className="text-text-muted text-small break-words">
        {label}
      </p>
      <Progress
        className="motion-reduce:[&_[data-slot=progress-indicator]]:transition-none"
        value={progress.progressPct}
        aria-label={t('barAria', { percent: progress.progressPct })}
      />
      <span className="text-caption text-text-muted self-end tabular-nums">
        {t('pct', { percent: progress.progressPct })}
      </span>
      {children}
    </section>
  );
}
