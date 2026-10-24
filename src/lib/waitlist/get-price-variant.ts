import 'server-only';
import { cookies } from 'next/headers';
import { PRICE_VARIANT_COOKIE, parsePriceVariant, type PriceVariant } from './variant';

/** The visitor's price variant; proxy.ts assigns it, so 'A' is only a defensive fallback. */
export async function getPriceVariant(): Promise<PriceVariant> {
  const store = await cookies();
  return parsePriceVariant(store.get(PRICE_VARIANT_COOKIE)?.value) ?? 'A';
}
