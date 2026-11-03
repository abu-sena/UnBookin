'use client';

import { BookOpenIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { AnswerSegment } from '@/lib/mentor/answer';
import { toAllowanceView } from '@/lib/mentor/protocol';
import { AnswerBody } from './answer-body';
import { QuotaEmptyNotice, QuotaSummary } from './mentor-quota';

const CHUNK_ID = '11111111-1111-4111-8111-111111111111';

function StaticChip({ page }: { page: number | null }) {
  const t = useTranslations('module.source');
  return (
    <span className="border-border bg-background text-small inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-button)] border px-3">
      <BookOpenIcon className="size-4" aria-hidden="true" />
      {page === null ? t('chipFallback') : t('chipWithPage', { page })}
    </span>
  );
}

export function MentorShowcase() {
  const t = useTranslations('mentor');
  const tDevUi = useTranslations('mentor.devUi');
  const tSamples = useTranslations('mentor.devUi.samples');
  const tSuggestions = useTranslations('mentor.suggestions');

  const answerSegments: AnswerSegment[] = [
    { type: 'text', text: tSamples('answer') },
    { type: 'citation', n: 1, chunkId: CHUNK_ID, page: 12 },
    { type: 'text', text: ' ' },
    { type: 'outside-start' },
    { type: 'text', text: tSamples('outside') },
    { type: 'outside-end' },
  ];

  const allowance = toAllowanceView({
    limit: 20,
    used: 3,
    remaining: 17,
    resetsAt: new Date('2026-12-01T00:00:00.000Z'),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{tDevUi('empty')}</h3>
        <div className="flex flex-wrap gap-2">
          {(['genericBigIdea', 'genericExamples', 'genericApply'] as const).map((key) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto min-h-11 text-left whitespace-normal"
            >
              {tSuggestions(key)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{tDevUi('conversation')}</h3>
        <div className="flex justify-end">
          <p className="bg-primary text-primary-fg text-reading max-w-[85%] rounded-[var(--radius-card)] px-3 py-2 [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
            {tSamples('question')}
          </p>
        </div>
        <div className="border-border bg-surface-2 max-w-[95%] rounded-[var(--radius-card)] border px-3 py-2">
          <AnswerBody
            segments={answerSegments}
            renderCitation={(citation) => <StaticChip page={citation.page} />}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{tDevUi('streaming')}</h3>
        <div className="border-border bg-surface-2 max-w-[95%] rounded-[var(--radius-card)] border px-3 py-2">
          <p className="text-reading">{tSamples('answer')}</p>
          <p className="text-small text-text-muted">{t('typing')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{tDevUi('error')}</h3>
        <div className="border-danger/30 bg-danger/5 flex flex-col items-start gap-2 rounded-[var(--radius-card)] border p-3">
          <p className="text-small text-text-muted">{t('notices.partial')}</p>
          <Button type="button" variant="outline" size="sm" disabled>
            {t('retry')}
          </Button>
        </div>
        <p className="text-small text-text-muted">{t('errors.rateLimited')}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{tDevUi('quota')}</h3>
        <QuotaSummary allowance={allowance} />
        <QuotaEmptyNotice resetsAt={allowance.resetsAt} />
      </div>
    </div>
  );
}
