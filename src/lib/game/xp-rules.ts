/**
 * E8-01 XP values for the M5 learning flows. Levels, streaks and badges are
 * M6; only these four events are recorded here.
 */
export const MODULE_READ = 20;
export const QUIZ_PASS = 30;
export const QUIZ_PERFECT_BONUS = 10;
export const REVIEW_DAILY = 10;

/** Values stored in `xp_events.type`. */
export const XP_EVENT_TYPES = {
  MODULE_READ: 'module_read',
  QUIZ_PASS: 'quiz_pass',
  QUIZ_PERFECT_BONUS: 'quiz_perfect',
  REVIEW_DAILY: 'review_daily',
} as const;
export type XpEventType = (typeof XP_EVENT_TYPES)[keyof typeof XP_EVENT_TYPES];

/** Values stored in `xp_events.ref_type`. */
export const XP_REF_TYPES = {
  MODULE: 'module',
  MODULE_QUIZ: 'module_quiz',
  REVIEW: 'review',
} as const;
export type XpRefType = (typeof XP_REF_TYPES)[keyof typeof XP_REF_TYPES];
