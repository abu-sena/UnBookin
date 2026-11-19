import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanPicker } from '@/components/billing/plan-picker';
import { PLANS, wrap } from './fixtures';

afterEach(cleanup);

describe('PlanPicker', () => {
  it('formats prices from the data without decimals', () => {
    render(wrap(<PlanPicker plans={PLANS} value="free" onChange={vi.fn()} />));

    expect(screen.getByText('Rp 59.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 29.000')).toBeInTheDocument();
    expect(screen.getAllByText('Selalu gratis').length).toBeGreaterThan(0);
  });

  it('shows the yearly savings label from the data', () => {
    render(wrap(<PlanPicker plans={PLANS} value="pro_monthly" onChange={vi.fn()} />));

    fireEvent.click(screen.getByRole('radio', { name: 'Tahunan' }));

    expect(screen.getByText('Rp 449.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 249.000')).toBeInTheDocument();
    expect(screen.getByText('Hemat 37%')).toBeInTheDocument();
    expect(screen.getByText('Hemat 28%')).toBeInTheDocument();
  });

  it('marks the current plan', () => {
    render(
      wrap(<PlanPicker plans={PLANS} currentPlanCode="pro_monthly" value="free" onChange={vi.fn()} />),
    );

    expect(screen.getByText('Paket aktif')).toBeInTheDocument();
  });

  it('selects the picked family at the active interval', () => {
    const onChange = vi.fn();
    render(wrap(<PlanPicker plans={PLANS} value="free" onChange={onChange} />));

    fireEvent.click(document.getElementById('plan-pro') as HTMLElement);

    expect(onChange).toHaveBeenCalledWith('pro_monthly');
  });
});