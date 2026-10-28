/**
 * E8-01 XP values. This module is the single source of truth for every XP
 * reward and the strings stored in `xp_events`.
 */
export const MODULE_READ = 20;
export const QUIZ_PASS = 30;
export const QUIZ_PERFECT_BONUS = 10;
export const REVIEW_DAILY = 10;
export const ACTION_VERIFIED = 50;
export const ACTION_REFLECTION = 40;
export const FIRST_UNBOOK = 50;

/** Mission rewards are template-driven and must stay inside this band. */
export const WEEKLY_MISSION_MIN = 30;
export const WEEKLY_MISSION_MAX = 60;

/** Values stored in `xp_events.type`. */
export const XP_EVENT_TYPES = {
  MODULE_READ: 'module_read',
  QUIZ_PASS: 'quiz_pass',
  QUIZ_PERFECT_BONUS: 'quiz_perfect',
  REVIEW_DAILY: 'review_daily',
  ACTION_VERIFIED: 'action_verified',
  ACTION_REFLECTION: 'action_reflection',
  FIRST_UNBOOK: 'first_unbook',
  WEEKLY_MISSION: 'weekly_mission',
} as const;
export type XpEventType = (typeof XP_EVENT_TYPES)[keyof typeof XP_EVENT_TYPES];

/** Values stored in `xp_events.ref_type`. */
export const XP_REF_TYPES = {
  MODULE: 'module',
  MODULE_QUIZ: 'module_quiz',
  REVIEW: 'review',
  ACTION: 'action',
  USER: 'user',
  MISSION: 'mission',
} as const;
export type XpRefType = (typeof XP_REF_TYPES)[keyof typeof XP_REF_TYPES];
