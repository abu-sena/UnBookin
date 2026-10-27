'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SourceDeleteButton } from '@/components/sources/source-delete-button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { unbookIdSchema } from '@/lib/sources/schema';
import { cn } from '@/lib/utils';
import type { LibraryItem, UnbookStatus } from '@/lib/library/types';

const coverVariants = [
  'bg-primary-soft text-primary',
  'bg-xp/10 text-xp',
  'bg-success/10 text-success',
  'bg-warning/10 text-warning',
  'bg-danger/10 text-danger',
] as const;

const statusClasses: Record<UnbookStatus, string> = {
  queued: 'border-border bg-surface-2 text-text-muted',
  outlining: 'border-primary/30 bg-primary-soft text-primary',
  generating: 'border-primary/30 bg-primary-soft text-primary',
  ready: 'border-success/30 bg-success/10 text-text',
  failed: 'border-danger/30 bg-danger/10 text-text',
};

function coverVariant(title: string): string {
  let hash = 0;
  for (const character of title) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return coverVariants[hash % coverVariants.length] ?? coverVariants[0];
}

function coverInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ? (Array.from(words[0])[0] ?? '') : '';
  const second = words[1] ? (Array.from(words[1])[0] ?? '') : '';
  return `${first}${second}`.toLocaleUpperCase('id-ID') || '?';
}

type LibraryCardProps = {
  item: LibraryItem;
};

/**
 * E2-03 AC1: one Unbook card with a deterministic CSS title cover (no image
 * column exists in the schema), metadata, actual pipeline status and module
 * reading progress. A real UUID id links the card to its status page and adds
 * a sibling delete control; dev fixtures with non-UUID ids stay purely
 * presentational (no links, no actions).
 */
export function LibraryCard({ item }: LibraryCardProps) {
  const t = useTranslations('library');
  const total = Math.max(0, item.moduleCount);
  const read = Math.min(Math.max(0, item.modulesRead), total);
  const percent = total === 0 ? 0 : Math.round((read / total) * 100);
  const parsedId = unbookIdSchema.safeParse(item.id);
  const unbookId = parsedId.success ? parsedId.data : null;

  const statusBadge = (
    <Badge variant="outline" className={cn('shrink-0', statusClasses[item.status])}>
      {t(`status.${item.status}`)}
    </Badge>
  );

  const metaLine = (
    <div className="text-caption text-text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="[overflow-wrap:anywhere] break-words">{item.interestName}</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{t('progress', { read, total: item.moduleCount })}</span>
    </div>
  );

  const progressBar = (
    <Progress
      value={percent}
      aria-label={t('progressAria', { read, total: item.moduleCount })}
      className="h-1.5 flex-1"
    />
  );

  return (
    <li className="border-border bg-surface flex min-w-0 gap-3 rounded-[var(--radius-card)] border p-3 shadow-[var(--shadow-card)]">
      <div
        aria-hidden="true"
        className={cn(
          'flex h-[88px] w-16 shrink-0 items-center justify-center rounded-[var(--radius-input)] px-2 text-center',
          coverVariant(item.title),
        )}
      >
        <span className="text-h3 tracking-wide break-words">{coverInitials(item.title)}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {unbookId ? (
          <>
            <Link
              href={`/unbook/${unbookId}`}
              aria-label={item.title}
              className="focus-visible:border-ring focus-visible:ring-ring/50 -m-1 flex min-h-[44px] flex-col items-start justify-center gap-1.5 rounded-[var(--radius-input)] border-transparent p-1 outline-none focus-visible:ring-[3px]"
            >
              <h2 className="text-h3 [overflow-wrap:anywhere] break-words">{item.title}</h2>
              <p className="text-small text-text-muted [overflow-wrap:anywhere] break-words">
                {item.author?.trim() || t('authorFallback')}
              </p>
              {metaLine}
              <div className="flex flex-wrap items-center gap-2">{statusBadge}</div>
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {progressBar}
              <SourceDeleteButton unbookId={unbookId} title={item.title} />
            </div>
          </>
        ) : (
          <>
            <h2 className="text-h3 [overflow-wrap:anywhere] break-words">{item.title}</h2>
            <p className="text-small text-text-muted [overflow-wrap:anywhere] break-words">
              {item.author?.trim() || t('authorFallback')}
            </p>
            {metaLine}
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {statusBadge}
              {progressBar}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
