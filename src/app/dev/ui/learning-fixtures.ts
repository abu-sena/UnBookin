import type { ModuleContent } from '@/lib/engine/module-content';
import type { ModulePathNode } from '@/components/module/path-node';

/** Realistic sample content for the /dev/ui learning section. */
export const sampleModule = {
  bigIdea: 'Pemimpin terbaik membangun sistem, bukan panggung.',
  whyItMatters:
    'Kamu tidak perlu menjadi pusat perhatian untuk membuat tim bergerak. Sistem kerja yang jelas membuat hasil tetap berjalan saat kamu tidak ada.',
  layers: {
    eli5:
      'Bayangkan tim seperti dapur restoran. Kalau semua orang tahu tugas dan urutannya, makanan tetap keluar meski koki utama sedang cuti.',
    practitioner: [
      {
        concept: 'Sistem kerja yang jelas',
        explanation:
          'Tulis siapa mengerjakan apa, bagaimana hasil diperiksa, dan kapan keputusan diambil. Tim tidak perlu menunggu kamu untuk hal kecil.',
        chunkRefs: [],
      },
      {
        concept: 'Budaya disiplin',
        explanation:
          'Disiplin muncul saat aturan sederhana dijalankan konsisten, bukan saat pengawasnya tegas.',
        chunkRefs: [],
      },
    ],
    expert: {
      assumptions: ['Kepemimpinan adalah fungsi sistem, bukan sifat individu.'],
      evidence: ['Perusahaan yang bertahan lama konsisten menjalankan mekanisme internal.'],
      critiques: ['Terlalu fokus sistem bisa melupakan kebutuhan adaptasi cepat.'],
      compareWith: ['Kepemimpinan kharismatik jangka pendek.'],
    },
  },
  conceptMap: {
    nodes: [
      { id: 'core', label: 'Pemimpin membangun sistem', kind: 'core' },
      { id: 'discipline', label: 'Budaya disiplin', kind: 'concept' },
      { id: 'feedback', label: 'Umpan balik rutin', kind: 'concept' },
      { id: 'meeting', label: 'Contoh: rapat mingguan', kind: 'example' },
      { id: 'owner', label: 'Pemilik keputusan', kind: 'concept' },
    ],
    edges: [
      { from: 'core', to: 'discipline', label: 'menumbuhkan' },
      { from: 'core', to: 'owner', label: 'memerlukan' },
      { from: 'discipline', to: 'feedback' },
      { from: 'feedback', to: 'meeting' },
      { from: 'owner', to: 'meeting', label: 'menjalankan' },
    ],
  },
  application: {
    caseStudy: {
      title: 'Rapat yang tidak bergantung pada satu orang',
      situation: 'Tim kehilangan arah saat ketua rapat tiba-tiba cuti.',
      howToApply: ['Tetapkan pemilik agenda.', 'Bagikan catatan keputusan ke semua orang.'],
    },
    tools: [
      {
        name: 'Checklist rapat mingguan',
        type: 'checklist',
        items: [
          'Tulis agenda sebelum rapat',
          'Tetapkan satu pemilik keputusan',
          'Catat aksi dan tenggatnya',
          'Bagikan ringkasan ke tim',
          'Tinjau hasil minggu lalu',
        ],
      },
    ],
    actionThisWeek: {
      title: 'Ubah satu rapat menjadi sistem yang berjalan sendiri',
      steps: [
        'Pilih satu rapat rutin yang paling sering menunggu kamu.',
        'Tentukan pemilik agenda dan pemilik keputusan.',
        'Bagikan catatan keputusan dalam 24 jam.',
      ],
      doneWhen: 'Rapat berikutnya berjalan tanpa kamu memandu setiap langkahnya.',
    },
    commonMistakes: [
      'Membuat aturan terlalu banyak sekaligus.',
      'Tetap mengambil semua keputusan kecil.',
      'Lupa meninjau apakah sistemnya bekerja.',
    ],
  },
  keyQuote: {
    text: 'Level 5 leaders build enduring greatness through a paradoxical blend of personal humility and professional will.',
    page: 42,
  },
  estimatedMinutes: 9,
} satisfies ModuleContent;

export const samplePathNodes: ModulePathNode[] = [
  { id: 'm1', title: 'Pemimpin membangun sistem', minutes: 8, state: 'done' },
  { id: 'm2', title: 'Budaya disiplin', minutes: 9, state: 'current' },
  { id: 'm3', title: 'Umpan balik yang aman', minutes: 7, state: 'available' },
  { id: 'm4', title: 'Pemilik keputusan', minutes: 10, state: 'locked' },
  { id: 'm5', title: 'Meninjau hasil bersama', minutes: 6, state: 'locked' },
];

export const sampleWeakConcepts = [
  'Membedakan pemilik agenda dan pemilik keputusan.',
  'Meninjau hasil tanpa menyalahkan orang.',
];
