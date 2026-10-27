'use client';

import { useTranslations } from 'next-intl';
import type { ModuleContent } from '@/lib/engine/module-content';
import type { ChecklistState } from '@/lib/learning/schemas';
import { ToolsList } from './tools-list';
import { WeeklyAction } from './weekly-action';

export type ApplyPanelProps = {
  moduleId: string;
  content: ModuleContent;
  checklist: ChecklistState;
  plannedActionId: string | null;
};

/** E4-02 AC5: case study, tools, common mistakes and the weekly action card. */
export function ApplyPanel({ moduleId, content, checklist, plannedActionId }: ApplyPanelProps) {
  const t = useTranslations('reader.module.apply');
  const { caseStudy, tools, actionThisWeek, commonMistakes } = content.application;

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <section className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
        <p className="text-caption text-primary font-semibold tracking-wide uppercase">
          {t('caseStudyLabel')}
        </p>
        <h2 className="text-h2 break-words">{caseStudy.title}</h2>
        <p className="text-reading text-text-muted break-words">{caseStudy.situation}</p>
        <div className="flex flex-col gap-2">
          <h3 className="text-h3">{t('howToApply')}</h3>
          <ol className="flex flex-col gap-2">
            {caseStudy.howToApply.map((step, index) => (
              <li key={`${index}-${step}`} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="bg-primary-soft text-primary text-caption mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-full)] font-semibold tabular-nums"
                >
                  {index + 1}
                </span>
                <span className="text-reading min-w-0 break-words">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {tools.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-h2">{t('toolsLabel')}</h2>
          <ToolsList moduleId={moduleId} tools={tools} checklist={checklist} />
        </section>
      ) : null}

      {commonMistakes.length > 0 ? (
        <section className="border-warning/30 bg-warning/5 flex flex-col gap-2 rounded-[var(--radius-card)] border p-5">
          <h2 className="text-h2">{t('commonMistakesLabel')}</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {commonMistakes.map((mistake, index) => (
              <li key={`${index}-${mistake}`} className="text-reading">
                {mistake}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <WeeklyAction moduleId={moduleId} action={actionThisWeek} plannedActionId={plannedActionId} />
    </div>
  );
}
