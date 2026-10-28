import type { JournalAction, JournalReport } from '@/lib/journal/types';

/**
 * Plain, serializable shapes for the journal UI. Dates cross the Server
 * Component boundary as ISO strings so Client Components never receive a
 * `Date` instance.
 */
export type JournalReportView = Omit<JournalReport, 'createdAt'> & {
  createdAt: string;
};

export type JournalActionView = Omit<JournalAction, 'dueAt' | 'reports'> & {
  dueAt: string | null;
  reports: JournalReportView[];
};

export function toJournalReportView(report: JournalReport): JournalReportView {
  return { ...report, createdAt: report.createdAt.toISOString() };
}

export function toJournalActionView(action: JournalAction): JournalActionView {
  return {
    ...action,
    dueAt: action.dueAt ? action.dueAt.toISOString() : null,
    reports: action.reports.map(toJournalReportView),
  };
}
