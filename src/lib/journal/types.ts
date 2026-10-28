export type JournalActionStatus = 'planned' | 'done' | 'skipped';

export type JournalReport = {
  id: string;
  whatIDid: string;
  result: string;
  reflection: string;
  evidenceUrl: string | null;
  aiFeedback: string | null;
  qualityScore: number | null;
  verified: boolean;
  createdAt: Date;
};

export type JournalAction = {
  id: string;
  moduleId: string;
  moduleTitle: string;
  unbookId: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  status: JournalActionStatus;
  reports: JournalReport[];
  canReport: boolean;
};

export type JournalActionResult = {
  actionId: string;
  status: JournalActionStatus;
  dueAt: Date | null;
};

export type SubmitActionReportResult = {
  reportId: string;
  qualityScore: number;
  feedback: string;
  verified: boolean;
  xpAwarded: number;
  canRevise: boolean;
};
