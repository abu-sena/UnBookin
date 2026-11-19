'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { formatIdr } from '@/lib/format';
import type { DisplayedPlan } from '@/lib/billing/pricing';
import {
  groupPlans,
  planCodeFor,
  planFamily,
  planForFamily,
  planInterval,
  type PlanInterval,
} from './plans';

type PlanPickerProps = {
  plans: DisplayedPlan[];
  /** Plan that applies right now, marked with a calm badge. */
  currentPlanCode?: string | null;
  /** Selected plan code (monthly or yearly). */
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  idPrefix?: string;
};

/**
 * E11-01: the three plan families with a monthly/yearly toggle. Prices and
 * savings labels only come from `getDisplayedPlans('A')`.
 */
export function PlanPicker({
  plans,
  currentPlanCode,
  value,
  onChange,
  disabled = false,
  idPrefix = 'plan',
}: PlanPickerProps) {
  const t = useTranslations('billing');
  const [interval, setInterval] = useState<PlanInterval>(() =>
    value === 'free' ? 'month' : planInterval(value),
  );
  const families = groupPlans(plans);

  function changeInterval(next: string) {
    if (next !== 'month' && next !== 'year') return;
    setInterval(next);
    if (value !== 'free') onChange(planCodeFor(planFamily(value), next));
  }

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        variant="outline"
        value={interval}
        onValueChange={changeInterval}
        disabled={disabled}
        aria-label={t('plans.monthly') + ' / ' + t('plans.yearly')}
        className="self-start"
      >
        <ToggleGroupItem value="month" className="min-h-11 px-4">
          {t('plans.monthly')}
        </ToggleGroupItem>
        <ToggleGroupItem value="year" className="min-h-11 px-4">
          {t('plans.yearly')}
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
        {families.map((view) => {
          const plan = planForFamily(view, interval);
          if (!plan) return null;
          const selected = value === plan.code;
          const current = currentPlanCode
            ? planFamily(currentPlanCode) === view.family
            : false;
          const isFree = view.family === 'free';
          const priceLabel = isFree ? t('plans.freeAlways') : formatIdr(plan.priceIdr);
          return (
            <div
              key={view.family}
              className={cn(
                'border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-4',
                selected && 'border-primary ring-primary/30 ring-2',
              )}
              data-selected={selected ? 'true' : 'false'}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-h3">{t(`plans.${view.family}`)}</h3>
                {current ? <Badge variant="secondary">{t('plans.current')}</Badge> : null}
              </div>
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-h2 font-bold tabular-nums">{priceLabel}</span>
                {isFree ? null : (
                  <span className="text-text-muted text-small">
                    {plan.interval === 'year' ? t('plans.perYear') : t('plans.perMonth')}
                  </span>
                )}
                {typeof plan.savingsPct === 'number' ? (
                  <span className="bg-primary-soft text-primary text-caption rounded-[var(--radius-full)] px-2 py-0.5 font-semibold">
                    {t('plans.savings', { pct: plan.savingsPct })}
                  </span>
                ) : null}
              </p>
              {isFree ? (
                <p className="text-caption text-text-muted">{t('plans.freeAlways')}</p>
              ) : (
                <Button
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  className="min-h-11 w-full"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => onChange(plan.code)}
                  id={`${idPrefix}-${view.family}`}
                >
                  {selected ? t('plans.selected') : t('plans.choose')}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}