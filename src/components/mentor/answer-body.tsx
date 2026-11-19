'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { AnswerSegment } from '@/lib/mentor/answer';

export type AnswerCitationSegment = Extract<AnswerSegment, { type: 'citation' }>;

export type AnswerBlock = { type: 'text' | 'outside'; segments: AnswerSegment[] };

/** Split plain text from the labelled "outside the source" runs (PRD E10-01 AC3). */
export function groupAnswerBlocks(segments: readonly AnswerSegment[]): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let current: AnswerBlock = { type: 'text', segments: [] };

  for (const segment of segments) {
    if (segment.type === 'outside-start') {
      if (current.segments.length > 0) blocks.push(current);
      current = { type: 'outside', segments: [] };
      continue;
    }
    if (segment.type === 'outside-end') {
      if (current.segments.length > 0) blocks.push(current);
      current = { type: 'text', segments: [] };
      continue;
    }
    current.segments.push(segment);
  }

  if (current.segments.length > 0) blocks.push(current);
  return blocks;
}

/** Merge adjacent text like stored rendering so live and history look identical. */
export function appendAnswerSegment(
  segments: readonly AnswerSegment[],
  next: AnswerSegment,
): AnswerSegment[] {
  const previous = segments.at(-1);
  if (next.type === 'text' && previous?.type === 'text') {
    return [...segments.slice(0, -1), { type: 'text', text: previous.text + next.text }];
  }
  return [...segments, next];
}

type SegmentListProps = {
  segments: readonly AnswerSegment[];
  renderCitation: (citation: AnswerCitationSegment) => ReactNode;
};

function SegmentList({ segments, renderCitation }: SegmentListProps) {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <span key={index} className="break-words whitespace-pre-wrap">
              {segment.text}
            </span>
          );
        }
        if (segment.type === 'citation') {
          return (
            <span key={index} className="max-w-full align-middle">
              {renderCitation(segment)}
            </span>
          );
        }
        return null;
      })}
    </>
  );
}

export type AnswerBodyProps = {
  segments: readonly AnswerSegment[];
  renderCitation: (citation: AnswerCitationSegment) => ReactNode;
  className?: string;
};

/**
 * One renderer for streamed and stored answers (PRD E10-01 AC2/AC3). Text is
 * always plain React text; markers never reach the DOM and HTML is not parsed.
 */
export function AnswerBody({ segments, renderCitation, className }: AnswerBodyProps) {
  const t = useTranslations('mentor');
  const blocks = groupAnswerBlocks(segments);

  return (
    <div className={className ?? 'flex min-w-0 flex-col gap-2'}>
      {blocks.map((block, index) =>
        block.type === 'outside' ? (
          <div
            key={index}
            role="group"
            aria-label={t('outsideLabel')}
            className="border-warning/40 bg-warning/5 min-w-0 rounded-[var(--radius-card)] border p-3"
          >
            <p className="text-caption text-warning mb-1 font-semibold">{t('outsideLabel')}</p>
            <div className="text-reading min-w-0 [overflow-wrap:anywhere]">
              <SegmentList segments={block.segments} renderCitation={renderCitation} />
            </div>
          </div>
        ) : (
          <div
            key={index}
            className="text-reading min-w-0 [overflow-wrap:anywhere]"
          >
            <SegmentList segments={block.segments} renderCitation={renderCitation} />
          </div>
        ),
      )}
    </div>
  );
}
