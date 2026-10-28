import type { JournalActionView, JournalReportView } from '@/components/journal/view-types';

export const actionId = '11111111-1111-4111-8111-111111111111';

export function makeReport(overrides: Partial<JournalReportView> = {}): JournalReportView {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    whatIDid:
      'Saya menulis tiga rutinitas tim, menetapkan pemilik untuk setiap langkah, dan mencatat cara mengukur hasilnya.',
    result: 'Tim menjalankan rutinitas lima hari tanpa saya mengingatkan.',
    reflection: '',
    evidenceUrl: null,
    aiFeedback: 'Laporanmu spesifik dan menunjukkan penerapan nyata.',
    qualityScore: 3,
    verified: true,
    createdAt: '2026-10-20T05:00:00.000Z',
    ...overrides,
  };
}

export function makeAction(overrides: Partial<JournalActionView> = {}): JournalActionView {
  return {
    id: actionId,
    moduleId: '33333333-3333-4333-8333-333333333333',
    moduleTitle: 'Membangun sistem yang bertahan',
    unbookId: '44444444-4444-4444-8444-444444444444',
    title: 'Tulis satu rutinitas tim',
    description: null,
    dueAt: '2026-11-03T05:00:00.000Z',
    status: 'planned',
    reports: [],
    canReport: true,
    ...overrides,
  };
}

export const nowIso = '2026-10-28T05:00:00.000Z';
