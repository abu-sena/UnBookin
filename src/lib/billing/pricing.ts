import 'server-only';
import type { PriceVariant } from '@/lib/waitlist/variant';

export type PlanCode = 'free' | 'pro_monthly' | 'pro_yearly' | 'byok_monthly' | 'byok_yearly';

export type DisplayedPlan = {
  code: PlanCode;
  name: string;
  /** Price in IDR for the given variant (variant A = `plans.price_idr`). */
  priceIdr: number;
  interval: 'month' | 'year';
  /** Yearly plans only: savings vs 12× the monthly price of the same family, rounded (E11-01). */
  savingsPct: number | null;
};

/**
 * Active plans with prices for a price variant, read from `plans` + `price_variants`
 * (never hard-coded). CONTRACT — implemented by task m1-waitlist.
 */
export async function getDisplayedPlans(variant: PriceVariant): Promise<DisplayedPlan[]> {
  void variant;
  throw new Error('getDisplayedPlans is implemented in task m1-waitlist');
}
