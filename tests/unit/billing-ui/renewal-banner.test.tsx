import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RenewalBanner } from '@/components/billing/renewal-banner';
import { RENEW_SOON_DAYS, daysUntil, isRenewSoon } from '@/components/billing/format';
import { wrap } from './fixtures';

afterEach(cleanup);

describe('renewal thresholds', () => {
  it('reminds from seven days out only', () => {
    expect(RENEW_SOON_DAYS).toBe(7);
    expect(isRenewSoon(7)).toBe(true);
    expect(isRenewSoon(1)).toBe(true);
    expect(isRenewSoon(8)).toBe(false);
    expect(isRenewSoon(null)).toBe(false);
  });

  it('rounds partial days up', () => {
    const now = new Date('2026-11-19T08:00:00.000Z');
    expect(daysUntil('2026-11-26T09:00:00.000Z', now)).toBe(8);
    expect(daysUntil('2026-11-19T09:00:00.000Z', now)).toBe(1);
    expect(daysUntil('2026-11-18T09:00:00.000Z', now)).toBe(0);
  });

  it('renders the calm banner with a renewal link', () => {
    render(wrap(<RenewalBanner daysLeft={3} />));

    expect(screen.getByText('Paketmu berakhir dalam 3 hari')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Perpanjang' })).toHaveAttribute(
      'href',
      '/settings/langganan',
    );
  });
});