import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['user', 'admin']);
export const experienceLevel = pgEnum('experience_level', ['novice', 'intermediate', 'advanced']);
export const sourceType = pgEnum('source_type', ['pdf', 'epub', 'url', 'text']);
export const sourceStatus = pgEnum('source_status', ['uploaded', 'extracting', 'ready', 'failed']);
export const unbookStatus = pgEnum('unbook_status', [
  'queued',
  'outlining',
  'generating',
  'ready',
  'failed',
]);
export const moduleStatus = pgEnum('module_status', ['not_started', 'reading', 'read']);
export const contentLayer = pgEnum('content_layer', ['eli5', 'practitioner', 'expert']);
export const bloomLevel = pgEnum('bloom_level', [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
]);
export const questionType = pgEnum('question_type', [
  'mcq',
  'multi_select',
  'case_mcq',
  'short_answer',
]);
export const reviewResult = pgEnum('review_result', ['again', 'hard', 'good']);
export const actionStatus = pgEnum('action_status', ['planned', 'done', 'skipped']);
export const domainLevel = pgEnum('domain_level', [
  'novice',
  'advanced_beginner',
  'competent',
  'proficient',
  'expert',
]);
export const badgeTier = pgEnum('badge_tier', ['bronze', 'silver', 'gold']);
export const missionType = pgEnum('mission_type', ['learn', 'review', 'apply']);
export const mentorRole = pgEnum('mentor_role', ['user', 'assistant']);
export const planCode = pgEnum('plan_code', [
  'free',
  'pro_monthly',
  'pro_yearly',
  'byok_monthly',
  'byok_yearly',
]);
export const subscriptionStatus = pgEnum('subscription_status', [
  'active',
  'past_due',
  'canceled',
  'expired',
]);
export const paymentKind = pgEnum('payment_kind', ['subscription', 'original']);
export const byokProvider = pgEnum('byok_provider', ['openrouter']);
export const byokConnection = pgEnum('byok_connection', ['oauth', 'manual']);
