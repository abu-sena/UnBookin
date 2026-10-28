import type { GameSummary, SkillTreeDomain } from '@/lib/game/queries';

export function makeSummary(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    totalXp: 300,
    level: 4,
    currentLevelXp: 200,
    nextLevelXp: 320,
    progress: 0.5,
    currentStreak: 3,
    longestStreak: 9,
    streakFreezes: 1,
    activeToday: true,
    today: '2026-10-28',
    lastActiveDate: '2026-10-28',
    domainLevels: [{ id: 'd1', name: 'Delegasi', level: 'novice', xp: 10 }],
    missions: [],
    badges: [],
    ...overrides,
  };
}

export function makeDomain(overrides: Partial<SkillTreeDomain> = {}): SkillTreeDomain {
  return {
    id: 'd1',
    name: 'Delegasi',
    xp: 180,
    level: 'advanced_beginner',
    passedQuizzes: 2,
    verifiedActions: 0,
    nextRequirements: { nextLevel: 'competent', xp: 500, passedQuizzes: 2, verifiedActions: 1 },
    modules: [{ id: 'm1', title: 'Modul satu', unbookId: 'u1' }],
    actions: [{ id: 'a1', title: 'Aksi satu' }],
    ...overrides,
  };
}
