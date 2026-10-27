import type { ModuleContent } from '@/lib/engine/module-content';
import type { UnbookPath } from '@/lib/learning/queries';
import type { SourceProgress } from '@/lib/sources/types';

export const USER_ID = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
export const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
export const OTHER_UNBOOK_ID = 'c3d4e5f6-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
export const MODULE_ID = 'd4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70';
export const NEXT_MODULE_ID = 'e5f6a7b8-9c0d-4e1f-8a2b-3c4d5e6f7081';
export const CHUNK_ONE = 'f6a7b8c9-0d1e-4f2a-9b3c-4d5e6f708192';
export const CHUNK_TWO = 'a7b8c9d0-1e2f-4a3b-8c4d-5e6f708192a3';

export const sampleContent = {
  bigIdea: 'Pemimpin terbaik membangun sistem, bukan panggung.',
  whyItMatters: 'Sistem kerja yang jelas membuat tim tetap bergerak saat kamu tidak ada.',
  layers: {
    eli5: 'Bayangkan tim seperti dapur restoran yang tahu urutan tugasnya.',
    practitioner: [
      {
        concept: 'Sistem kerja yang jelas',
        explanation: 'Tulis siapa mengerjakan apa dan kapan keputusan diambil.',
        chunkRefs: [CHUNK_ONE, CHUNK_TWO],
      },
      {
        concept: 'Budaya disiplin',
        explanation: 'Aturan sederhana yang dijalankan konsisten.',
        chunkRefs: [CHUNK_TWO],
      },
    ],
    expert: {
      assumptions: ['Kepemimpinan adalah fungsi sistem.'],
      evidence: ['Perusahaan bertahan lama menjalankan mekanisme internal.'],
      critiques: ['Terlalu fokus sistem bisa melupakan adaptasi.'],
      compareWith: ['Kepemimpinan karismatik jangka pendek.'],
    },
  },
  conceptMap: {
    nodes: [
      { id: 'core', label: 'Pemimpin membangun sistem', kind: 'core' },
      { id: 'discipline', label: 'Budaya disiplin', kind: 'concept' },
    ],
    edges: [{ from: 'core', to: 'discipline', label: 'menumbuhkan' }],
  },
  application: {
    caseStudy: {
      title: 'Rapat yang tidak bergantung pada satu orang',
      situation: 'Tim kehilangan arah saat ketua rapat cuti.',
      howToApply: ['Tetapkan pemilik agenda.', 'Bagikan catatan keputusan.'],
    },
    tools: [
      {
        name: 'Checklist rapat mingguan',
        type: 'checklist',
        items: ['Tulis agenda sebelum rapat', 'Tetapkan satu pemilik keputusan'],
      },
      {
        name: 'Daftar pertanyaan refleksi',
        type: 'questions',
        items: ['Apa yang berjalan baik?', 'Apa yang perlu diubah?'],
      },
    ],
    actionThisWeek: {
      title: 'Ubah satu rapat menjadi sistem',
      steps: ['Pilih satu rapat rutin.', 'Tentukan pemilik keputusan.'],
      doneWhen: 'Rapat berikutnya berjalan tanpa kamu memandu.',
    },
    commonMistakes: ['Membuat aturan terlalu banyak sekaligus.'],
  },
  keyQuote: {
    text: 'Level 5 leaders build enduring greatness.',
    page: 42,
  },
  estimatedMinutes: 9,
} satisfies ModuleContent;

export const samplePath: UnbookPath = {
  unbookId: UNBOOK_ID,
  title: 'Pemimpin yang Membangun Sistem',
  bigIdea: 'Sistem yang baik bekerja saat pemimpinnya tidak ada.',
  modules: [
    {
      moduleId: MODULE_ID,
      title: 'Pemimpin membangun sistem',
      summary: null,
      estimatedMinutes: 8,
      status: 'reading',
      state: 'current',
    },
    {
      moduleId: NEXT_MODULE_ID,
      title: 'Budaya disiplin',
      summary: null,
      estimatedMinutes: 9,
      status: 'not_started',
      state: 'locked',
    },
  ],
  modulesDone: 0,
  modulesTotal: 2,
  continueModuleId: MODULE_ID,
};

export const completedPath: UnbookPath = {
  ...samplePath,
  modules: samplePath.modules.map((node) => ({ ...node, status: 'read', state: 'done' })),
  modulesDone: 2,
  continueModuleId: null,
};

export const sourceProgress = (overrides: Partial<SourceProgress> = {}): SourceProgress => ({
  unbookId: UNBOOK_ID,
  title: 'Pemimpin yang Membangun Sistem',
  sourceId: null,
  sourceStatus: 'ready',
  unbookStatus: 'generating',
  stage: 'generating',
  progressPct: 40,
  embeddedChunks: 3,
  totalChunks: 5,
  moduleCount: 2,
  modulesCompleted: 1,
  errorCode: null,
  ...overrides,
});
