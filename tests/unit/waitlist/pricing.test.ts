import { beforeEach, expect, it, vi } from 'vitest';
const select = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: { select } }));
import { getDisplayedPlans } from '@/lib/billing/pricing';
import { planSeeds, priceVariantSeeds } from '@/db/seed-data';

beforeEach(() => {
  select.mockReturnValue({
    from: () => ({
      leftJoin: () => ({
        where: async () =>
          [...planSeeds].reverse().map((row) => ({
            code: row.code,
            name: row.name,
            interval: row.interval,
            basePrice: row.priceIdr,
            variantPrice:
              priceVariantSeeds.find((price) => price.planCode === row.code)?.priceIdr ?? null,
          })),
      }),
    }),
  });
});
it('orders active A plans and ignores variant overrides', async () => {
  const plans = await getDisplayedPlans('A');
  expect(plans.map((row) => row.code)).toEqual([
    'free',
    'pro_monthly',
    'pro_yearly',
    'byok_monthly',
    'byok_yearly',
  ]);
  expect(plans.map((row) => row.priceIdr)).toEqual([0, 59000, 449000, 29000, 249000]);
  expect(plans.map((row) => row.savingsPct)).toEqual([null, null, 37, null, 28]);
  expect(plans.map((row) => row.interval)).toEqual(['month', 'month', 'year', 'month', 'year']);
});
it('uses B overrides and computes matching monthly savings', async () => {
  const plans = await getDisplayedPlans('B');
  expect(plans.map((row) => row.priceIdr)).toEqual([0, 49000, 379000, 25000, 199000]);
  expect(plans.map((row) => row.savingsPct)).toEqual([null, null, 36, null, 34]);
});
it('falls back to base price when B override is missing', async () => {
  select.mockReturnValue({
    from: () => ({
      leftJoin: () => ({
        where: async () => [
          {
            code: 'pro_monthly',
            name: 'Pro',
            interval: 'month',
            basePrice: 59000,
            variantPrice: null,
          },
          {
            code: 'pro_yearly',
            name: 'Pro',
            interval: 'year',
            basePrice: 449000,
            variantPrice: null,
          },
        ],
      }),
    }),
  });
  expect(await getDisplayedPlans('B')).toEqual([
    { code: 'pro_monthly', name: 'Pro', interval: 'month', priceIdr: 59000, savingsPct: null },
    { code: 'pro_yearly', name: 'Pro', interval: 'year', priceIdr: 449000, savingsPct: 37 },
  ]);
});
