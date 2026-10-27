'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { type SourceProgress } from '@/lib/sources/types';

const PROCESSING_STAGES = [
  'uploading',
  'reading',
  'chunking',
  'embedding',
  'outlining',
  'generating',
] as const;

type ProcessingStage = (typeof PROCESSING_STAGES)[number];

function isProcessingStage(stage: SourceProgress['stage']): stage is ProcessingStage {
  return (PROCESSING_STAGES as readonly string[]).includes(stage);
}

export function SourceProgressCard({
  progress,
  children,
}: {
  progress: SourceProgress;
  children?: ReactNode;
}) {
  const t = useTranslations('sources.progress');

  const failed = progress.sourceStatus === 'failed' || progress.unbookStatus === 'failed';
  const ready = !failed && progress.unbookStatus === 'ready';
  const stage = progress.stage;
  const ingested = stage === 'ingested' && !failed && !ready;
  const stageLabel = isProcessingStage(stage) ? t(`stage.${stage}`) : t('fallbackStage');
  const embedding = stage === 'embedding' && progress.totalChunks > 0;

  return (
    <section className="bg-surface border-border flex w-full min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border p-4">
      <h2 className="text-h3 min-w-0 break-words">{progress.title}</h2>

      {failed ? (
        <p role="alert" className="text-danger text-small break-words">
          {progress.errorCode ? t(`errors.${progress.errorCode}`) : t('failedFallback')}
        </p>
      ) : ready ? (
        <p className="text-success text-small font-medium">{t('ready')}</p>
      ) : ingested ? (
        <>
          <p className="text-text-muted text-small break-words">{t('ingested')}</p>
          <Button asChild variant="outline" className="self-start">
            <Link href="/library">{t('ingestedAction')}</Link>
          </Button>
        </>
      ) : (
        <p className="text-text-muted text-small">{stageLabel}</p>
      )}

      {!failed ? (
        <div className="flex w-full min-w-0 flex-col gap-1">
          <Progress
            value={progress.progressPct}
            aria-label={t('barAria', { percent: progress.progressPct })}
          />
          <div className="text-caption text-text-muted flex w-full min-w-0 items-center justify-between gap-2 tabular-nums">
            <span className="min-w-0 break-words">
              {embedding
                ? t('chunks', {
                    embedded: progress.embeddedChunks,
                    total: progress.totalChunks,
                  })
                : null}
            </span>
            <span>{t('pct', { percent: progress.progressPct })}</span>
          </div>
        </div>
      ) : null}

      {children}
    </section>
  );
}
