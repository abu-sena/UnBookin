import posthog from 'posthog-js';

/**
 * PostHog event names, exactly the event list in PRD §14.
 *
 * IMPORTANT: source texts, action reports, and mentor messages must never be
 * sent to analytics — only the typed properties declared here are allowed.
 */
export type AnalyticsEvent =
  | 'waitlist_joined'
  | 'signed_up'
  | 'onboarding_completed'
  | 'source_upload_started'
  | 'source_upload_failed'
  | 'unbook_completed'
  | 'module_opened'
  | 'layer_viewed'
  | 'module_read'
  | 'action_created'
  | 'quiz_started'
  | 'quiz_finished'
  | 'review_session_completed'
  | 'action_reported'
  | 'xp_earned'
  | 'level_up'
  | 'domain_level_up'
  | 'badge_earned'
  | 'streak_extended'
  | 'mentor_message_sent'
  | 'paywall_viewed'
  | 'checkout_started'
  | 'subscription_activated'
  | 'byok_connected';

/** Payloads for events that carry properties in PRD §14. */
export interface AnalyticsEventProperties {
  unbook_completed: {
    pages: number;
    modules: number;
    duration_s: number;
    byok: boolean;
  };
  layer_viewed: { layer: 'understand' | 'apply' | 'prove' };
  quiz_finished: { score: number; passed: boolean; attempt: number };
  review_session_completed: { cards: number };
  action_reported: { quality_score: number; verified: boolean };
  xp_earned: { type: string; amount: number };
  paywall_viewed: { trigger: string };
  checkout_started: { plan: string };
  subscription_activated: { plan: string };
  byok_connected: { method: string };
}

type EventPayloads = {
  [E in AnalyticsEvent]: E extends keyof AnalyticsEventProperties
    ? AnalyticsEventProperties[E]
    : Record<string, never>;
};

type TrackArguments = {
  [E in keyof EventPayloads]: EventPayloads[E] extends Record<string, never>
    ? []
    : [properties: EventPayloads[E]];
};

/**
 * Track a PostHog event with type-checked name and properties.
 * No-op on the server and when PostHog is not configured.
 */
export function track<E extends AnalyticsEvent>(event: E, ...args: TrackArguments[E]): void {
  if (typeof window === 'undefined') {
    return;
  }
  posthog.capture(event, args[0]);
}
