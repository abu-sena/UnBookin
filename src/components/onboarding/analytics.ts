/**
 * The shared PostHog event map (`src/lib/analytics/events.ts`) is owned by the
 * analytics task, so this task declares its own payload instead of editing that
 * file. Move this block into the shared map when the analytics task next
 * touches it.
 */
declare module '@/lib/analytics/events' {
  interface AnalyticsEventProperties {
    onboarding_completed: { daily_goal_minutes: number; interest_count: number };
  }
}

export {};
