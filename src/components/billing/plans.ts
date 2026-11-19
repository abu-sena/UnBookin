import type { DisplayedPlan, PlanCode } from '@/lib/billing/pricing';

export type PlanFamily = 'free' | 'pro' | 'byok';
export type PlanInterval = 'month' | 'year';

export type PlanFamilyView = {
  family: PlanFamily;
  monthly: DisplayedPlan;
  yearly: DisplayedPlan | null;
};

const FAMILY_ORDER: PlanFamily[] = ['free', 'pro', 'byok'];

const FAMILY_BY_CODE: Record<PlanCode, PlanFamily> = {
  free: 'free',
  pro_monthly: 'pro',
  pro_yearly: 'pro',
  byok_monthly: 'byok',
  byok_yearly: 'byok',
};

export function planFamily(code: string): PlanFamily {
  return FAMILY_BY_CODE[code as PlanCode] ?? 'free';
}

export function planInterval(code: string): PlanInterval {
  return code.endsWith('_yearly') ? 'year' : 'month';
}

/** Group the displayed plans into the three families shown by the picker. */
export function groupPlans(plans: DisplayedPlan[]): PlanFamilyView[] {
  const byCode = new Map(plans.map((plan) => [plan.code, plan]));
  return FAMILY_ORDER.flatMap((family) => {
    const monthly =
      family === 'free' ? byCode.get('free') : byCode.get(`${family}_monthly` as PlanCode);
    if (!monthly) return [];
    const yearly = family === 'free' ? null : byCode.get(`${family}_yearly` as PlanCode) ?? null;
    return [{ family, monthly, yearly }];
  });
}

/** Monthly/yearly plan code for a family at the current interval. */
export function planCodeFor(family: PlanFamily, interval: PlanInterval): PlanCode {
  if (family === 'free') return 'free';
  return `${family}_${interval === 'year' ? 'yearly' : 'monthly'}` as PlanCode;
}

export function planForFamily(
  view: PlanFamilyView,
  interval: PlanInterval,
): DisplayedPlan | null {
  if (view.family === 'free') return view.monthly;
  return interval === 'year' ? view.yearly ?? view.monthly : view.monthly;
}