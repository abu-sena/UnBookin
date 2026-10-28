'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { JournalReportView } from './view-types';

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

type JournalReportHistoryProps = {
  reports: JournalReportView[];
};

/** E7-02: the persisted report history, always readable on the detail page. */
export function JournalReportHistory({ reports }: JournalReportHistoryProps) {
  const t = useTranslations('journal.detail');
  const visibleReports = reports.slice(-2);

  return (
    <section aria-labelledby="journal-reports-title" className="flex flex-col gap-3">
      <h2 id="journal-reports-title" className="text-h2">
        {t('reportsTitle')}
      </h2>

      {visibleReports.length === 0 ? (
        <p className="text-body text-text-muted">{t('reportsEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {visibleReports.map((report, index) => (
            <li key={report.id}>
              <article className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-h3">{t('reportNumber', { number: index + 1 })}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {report.qualityScore !== null ? (
                      <Badge variant="secondary" className="tabular-nums">
                        {t('score', { score: report.qualityScore })}
                      </Badge>
                    ) : null}
                    {report.verified ? (
                      <Badge className="border-success/30 bg-success/10 text-success">
                        {t('verified')}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <p className="text-caption text-text-muted">
                  {t('createdAt', { date: dateFormatter.format(new Date(report.createdAt)) })}
                </p>

                <div className="flex flex-col gap-1">
                  <h4 className="text-small font-semibold">{t('whatLabel')}</h4>
                  <p className="text-body break-words whitespace-pre-wrap">{report.whatIDid}</p>
                </div>

                <div className="flex flex-col gap-1">
                  <h4 className="text-small font-semibold">{t('resultLabel')}</h4>
                  <p className="text-body break-words whitespace-pre-wrap">{report.result}</p>
                </div>

                {report.reflection.trim().length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <h4 className="text-small font-semibold">{t('reflectionLabel')}</h4>
                    <p className="text-body break-words whitespace-pre-wrap">{report.reflection}</p>
                  </div>
                ) : null}

                {report.evidenceUrl ? (
                  <div className="flex flex-col gap-1">
                    <h4 className="text-small font-semibold">{t('evidenceLabel')}</h4>
                    <a
                      href={report.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-small min-h-11 break-all underline-offset-4 hover:underline"
                    >
                      {report.evidenceUrl}
                    </a>
                  </div>
                ) : null}

                {report.aiFeedback ? (
                  <div className="bg-surface-2 flex flex-col gap-1 rounded-[var(--radius-button)] p-4">
                    <h4 className="text-small font-semibold">{t('feedbackLabel')}</h4>
                    <p className="text-body break-words whitespace-pre-wrap">{report.aiFeedback}</p>
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
