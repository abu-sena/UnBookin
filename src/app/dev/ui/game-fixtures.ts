import type { GameSummary, SkillTreeInterest } from '@/lib/game/queries';

/** Static, clearly fake sample data for the /dev/ui game section only. */
export const sampleSummary: GameSummary = {
  totalXp: 430,
  level: 5,
  currentLevelXp: 280,
  nextLevelXp: 400,
  progress: 1,
  currentStreak: 6,
  longestStreak: 12,
  streakFreezes: 1,
  activeToday: true,
  today: '2026-10-28',
  lastActiveDate: '2026-10-28',
  domainLevels: [],
  missions: [
    {
      id: 'sample-m1',
      title: 'Baca 3 modul minggu ini',
      type: 'learn',
      target: 3,
      progress: 2,
      xpReward: 40,
      completed: false,
    },
    {
      id: 'sample-m2',
      title: 'Selesaikan 5 kartu review',
      type: 'review',
      target: 5,
      progress: 0,
      xpReward: 30,
      completed: false,
    },
    {
      id: 'sample-m3',
      title: 'Laporkan 1 aksi penerapan',
      type: 'apply',
      target: 1,
      progress: 1,
      xpReward: 60,
      completed: true,
    },
  ],
  badges: [
    {
      id: 'sample-b1',
      name: 'Langkah pertama',
      description: 'Selesaikan modul pertamamu.',
      icon: 'footprints',
      tier: 'bronze',
      earned: true,
    },
    {
      id: 'sample-b2',
      name: 'Api menyala',
      description: 'Belajar tujuh hari berturut-turut.',
      icon: 'flame',
      tier: 'gold',
      earned: false,
    },
  ],
};

export const sampleLevelCapped = { level: 30, progress: 1, nextLevelXp: null };

export const sampleSkillTree: SkillTreeInterest[] = [
  {
    id: 'sample-i1',
    name: 'Kepemimpinan',
    slug: 'kepemimpinan',
    domains: [
      {
        id: 'sample-d1',
        name: 'Membangun sistem tim',
        xp: 180,
        level: 'advanced_beginner',
        passedQuizzes: 2,
        verifiedActions: 0,
        nextRequirements: { nextLevel: 'competent', xp: 500, passedQuizzes: 2, verifiedActions: 1 },
        modules: [{ id: 'sample-mod-1', title: 'Sistem, bukan panggung', unbookId: 'sample-ub-1' }],
        actions: [],
      },
      {
        id: 'sample-d2',
        name: 'Umpan balik yang jujur dan bermanfaat bagi seluruh anggota tim',
        xp: 2600,
        level: 'expert',
        passedQuizzes: 5,
        verifiedActions: 7,
        nextRequirements: null,
        modules: [],
        actions: [{ id: 'sample-act-1', title: 'Tulis rutinitas umpan balik mingguan' }],
      },
      {
        id: 'sample-d3',
        name: 'Delegasi',
        xp: 0,
        level: 'novice',
        passedQuizzes: 0,
        verifiedActions: 0,
        nextRequirements: {
          nextLevel: 'advanced_beginner',
          xp: 150,
          passedQuizzes: 2,
          verifiedActions: 0,
        },
        modules: [],
        actions: [],
      },
    ],
  },
];
