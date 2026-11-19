import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOrderStatus,
  getSubscriptionOverview,
  startCheckout,
} from '@/lib/billing/actions';
import { SubscriptionSettings } from '@/components/billing/subscription-settings';
import { MAX_POLLS, POLL_INTERVAL_MS } from '@/components/billing/order-status-panel';
import { storeReturnPath } from '@/components/billing/snap-checkout';
import { FREE_OVERVIEW, PAID_OVERVIEW, PLANS, wrap } from './fixtures';

vi.mock('@/lib/billing/actions', () => ({
  startCheckout: vi.fn(),
  getOrderStatus: vi.fn(),
  getSubscriptionOverview: vi.fn(),
}));

const pendingView = {
  ok: true as const,
  data: {
    orderId: 'UB-1',
    status: 'pending' as const,
    planCode: 'pro_monthly' as const,
    amountIdr: 59000,
    paidAt: null,
  },
};
const paidView = {
  ok: true as const,
  data: {
    orderId: 'UB-1',
    status: 'paid' as const,
    planCode: 'pro_monthly' as const,
    amountIdr: 59000,
    paidAt: '2026-11-19T08:00:00.000Z',
  },
};
const failedView = {
  ok: true as const,
  data: {
    orderId: 'UB-1',
    status: 'failed' as const,
    planCode: 'pro_monthly' as const,
    amountIdr: 59000,
    paidAt: null,
  },
};

beforeEach(() => {
  vi.mocked(getOrderStatus).mockReset();
  vi.mocked(startCheckout).mockReset();
  vi.mocked(getSubscriptionOverview).mockReset().mockResolvedValue({
    ok: true,
    data: PAID_OVERVIEW,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderSettings(overrides: Partial<React.ComponentProps<typeof SubscriptionSettings>> = {}) {
  return render(
    wrap(
      <SubscriptionSettings
        plans={PLANS}
        overview={PAID_OVERVIEW}
        clientKey="client-key"
        snapUrl="https://app.sandbox.midtrans.com/snap/snap.js"
        initialOrderId={null}
        {...overrides}
      />,
    ),
  );
}

describe('SubscriptionSettings', () => {
  it('shows the current plan, renewal reminder, and payment history', () => {
    renderSettings({ overview: { ...PAID_OVERVIEW, renewSoon: true, daysLeft: 3 } });

    expect(screen.getAllByText('Pro Bulanan').length).toBeGreaterThan(0);
    expect(screen.getByText('Paketmu berakhir dalam 3 hari')).toBeInTheDocument();
    expect(screen.getByText('Lunas')).toBeInTheDocument();
    expect(screen.getByText('Menunggu')).toBeInTheDocument();
  });

  it('hides the renewal banner outside the seven-day threshold', () => {
    renderSettings({ overview: { ...PAID_OVERVIEW, renewSoon: false, daysLeft: 8 } });

    expect(screen.queryByText(/Paketmu berakhir/)).not.toBeInTheDocument();
  });

  it('keeps a calm state when the Midtrans client key is missing', () => {
    renderSettings({ overview: FREE_OVERVIEW, clientKey: null });

    expect(
      screen.getByText('Pembayaran belum tersedia. Coba lagi nanti, ya.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lanjutkan pembayaran' })).toBeDisabled();
  });

  it('polls pending then paid and shows the plan and end date', async () => {
    vi.useFakeTimers();
    vi.mocked(getOrderStatus).mockResolvedValueOnce(pendingView).mockResolvedValueOnce(paidView);
    const { container } = renderSettings({ initialOrderId: 'UB-1' });

    await act(async () => {});
    expect(container.querySelector('[data-phase="waiting"]')).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });

    expect(container.querySelector('[data-phase="paid"]')).not.toBeNull();
    expect(screen.getByText(/Pro Bulanan aktif sampai/)).toBeInTheDocument();
    expect(getSubscriptionOverview).toHaveBeenCalled();
  });

  it('offers the stored return path after payment', async () => {
    vi.useFakeTimers();
    storeReturnPath('UB-1', '/library');
    vi.mocked(getOrderStatus).mockResolvedValue(paidView);
    renderSettings({ initialOrderId: 'UB-1' });

    await act(async () => {});

    expect(screen.getByRole('link', { name: 'Kembali ke /library' })).toHaveAttribute(
      'href',
      '/library',
    );
    window.sessionStorage.clear();
  });

  it('stops polling and offers retry when the payment fails', async () => {
    vi.useFakeTimers();
    vi.mocked(getOrderStatus).mockResolvedValue(failedView);
    const { container } = renderSettings({ initialOrderId: 'UB-1' });

    await act(async () => {});

    expect(container.querySelector('[data-phase="failed"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
    expect(vi.mocked(getOrderStatus)).toHaveBeenCalledTimes(1);
  });

  it('times out after the polling window', async () => {
    vi.useFakeTimers();
    vi.mocked(getOrderStatus).mockResolvedValue(pendingView);
    const { container } = renderSettings({ initialOrderId: 'UB-1' });

    await act(async () => {});
    for (let i = 0; i < MAX_POLLS; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      });
    }

    expect(container.querySelector('[data-phase="timeout"]')).not.toBeNull();
  });

  it('starts checkout and hands the order to Snap', async () => {
    vi.mocked(startCheckout).mockResolvedValue({
      ok: true,
      data: {
        orderId: 'UB-2',
        token: 'token-2',
        redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/token-2',
      },
    });
    const pay = vi.fn();
    window.snap = { pay };

    renderSettings({ overview: FREE_OVERVIEW });
    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan pembayaran' }));

    await act(async () => {});

    expect(startCheckout).toHaveBeenCalledWith({ planCode: 'pro_monthly' });
    expect(pay).toHaveBeenCalledWith('token-2');
    delete window.snap;
  });
});