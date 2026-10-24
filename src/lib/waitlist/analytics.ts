import { track } from '@/lib/analytics/events';
import type { PriceVariant } from './variant';

declare module '@/lib/analytics/events' {
  interface AnalyticsEventProperties {
    waitlist_joined: { interest: string; price_variant: PriceVariant };
  }
}

export function trackWaitlistJoined(interest: string, priceVariant: PriceVariant): void {
  track('waitlist_joined', { interest, price_variant: priceVariant });
}
