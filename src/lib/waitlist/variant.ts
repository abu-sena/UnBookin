// E0-02 AC2: visitors are randomly assigned price variant A or B; the choice is kept in a cookie
// (assigned by src/proxy.ts) and stored in waitlist.price_variant on sign-up.
export const PRICE_VARIANTS = ['A', 'B'] as const;
export type PriceVariant = (typeof PRICE_VARIANTS)[number];

export const PRICE_VARIANT_COOKIE = 'ub_price_variant';
export const PRICE_VARIANT_MAX_AGE = 60 * 60 * 24 * 180;

export function parsePriceVariant(value: unknown): PriceVariant | null {
  return PRICE_VARIANTS.includes(value as PriceVariant) ? (value as PriceVariant) : null;
}

export function pickPriceVariant(random: () => number = Math.random): PriceVariant {
  return random() < 0.5 ? 'A' : 'B';
}
