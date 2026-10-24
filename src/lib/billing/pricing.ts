import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { plans, priceVariants } from '@/db/schema';
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
 * (never hard-coded).
 */
export function computeSavingsPct(yearly: number, monthly: number): number | null {
  return monthly > 0 ? Math.round((1 - yearly / (12 * monthly)) * 100) : null;
}

export async function getDisplayedPlans(variant: PriceVariant): Promise<DisplayedPlan[]> {
  const rows = await db
    .select({
      code: plans.code,
      name: plans.name,
      interval: plans.interval,
      basePrice: plans.priceIdr,
      variantPrice: priceVariants.priceIdr,
    })
    .from(plans)
    .leftJoin(
      priceVariants,
      and(eq(priceVariants.planCode, plans.code), eq(priceVariants.variant, variant)),
    )
    .where(eq(plans.isActive, true));
  const order: PlanCode[] = ['free', 'pro_monthly', 'pro_yearly', 'byok_monthly', 'byok_yearly'];
  const prices = new Map(
    rows.map((row) => [
      row.code,
      variant === 'B' ? (row.variantPrice ?? row.basePrice) : row.basePrice,
    ]),
  );
  return rows
    .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))
    .map((row) => {
      if (row.interval !== 'month' && row.interval !== 'year')
        throw new Error('Unsupported plan interval');
      const priceIdr = prices.get(row.code)!;
      const monthlyCode = row.code.replace('_yearly', '_monthly') as PlanCode;
      const monthly = prices.get(monthlyCode);
      return {
        code: row.code,
        name: row.name,
        interval: row.interval,
        priceIdr,
        savingsPct:
          row.code.endsWith('_yearly') && monthly !== undefined
            ? computeSavingsPct(priceIdr, monthly)
            : null,
      };
    });
}
