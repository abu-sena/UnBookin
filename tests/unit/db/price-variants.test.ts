import { expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { priceVariants } from '@/db/schema';
import { priceVariantSeeds } from '@/db/seed-data';

it('matches founder-approved B prices, leaving A to plans', () => {
  expect(priceVariantSeeds).toEqual([
    { variant: 'B', planCode: 'free', priceIdr: 0 },
    { variant: 'B', planCode: 'pro_monthly', priceIdr: 49000 },
    { variant: 'B', planCode: 'pro_yearly', priceIdr: 379000 },
    { variant: 'B', planCode: 'byok_monthly', priceIdr: 25000 },
    { variant: 'B', planCode: 'byok_yearly', priceIdr: 199000 },
  ]);
});
it('constrains variant, references plans and uniquely pairs variant with plan', () => {
  const config = getTableConfig(priceVariants);
  expect(config.checks).toHaveLength(1);
  expect(config.foreignKeys[0]!.reference().foreignColumns[0]!.name).toBe('code');
  expect(config.uniqueConstraints[0]!.columns.map((column) => column.name)).toEqual([
    'variant',
    'planCode',
  ]);
  expect(priceVariants.priceIdr.notNull).toBe(true);
});
