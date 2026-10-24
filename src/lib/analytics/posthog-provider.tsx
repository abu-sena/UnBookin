'use client';

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

// Analytics is opt-in through configuration: without a key nothing is
// initialised and children render untouched.
let initialised = false;

function initPostHog(): void {
  if (!POSTHOG_KEY || initialised) {
    return;
  }
  initialised = true;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: 'history_change',
    person_profiles: 'identified_only',
    autocapture: false,
  });
}

initPostHog();

export function PostHogAnalytics({ children }: { children: React.ReactNode }) {
  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
