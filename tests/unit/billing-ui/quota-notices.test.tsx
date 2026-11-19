import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPaywallConfig, startCheckout } from '@/lib/billing/actions';
import { QuotaEmptyNotice } from '@/components/mentor/mentor-quota';
import { UploadErrorNotice } from '@/components/sources/upload-error-notice';
import { LIMITS, PLANS, wrap } from './fixtures';

vi.mock('@/lib/billing/actions', () => ({
  getPaywallConfig: vi.fn(),
  startCheckout: vi.fn(),
}));

vi.mock('@/components/layout/sheet', () => ({
  Sheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    description?: string;
    children: ReactNode;
  }) => (open ? <div role="dialog" aria-label={title}>{children}</div> : null),
}));

beforeEach(() => {
  vi.mocked(getPaywallConfig).mockReset().mockResolvedValue({
    ok: true,
    data: {
      plans: PLANS,
      clientKey: 'client-key',
      snapUrl: 'https://app.sandbox.midtrans.com/snap/snap.js',
    },
  });
  vi.mocked(startCheckout).mockReset();
});

afterEach(cleanup);

describe('quota-empty upgrade buttons', () => {
  it('opens the paywall from the Mentor quota notice', async () => {
    render(wrap(<QuotaEmptyNotice resetsAt="2026-12-01T00:00:00.000Z" />));

    fireEvent.click(screen.getByRole('button', { name: 'Tingkatkan paket' }));

    expect(await screen.findByRole('dialog', { name: 'Tingkatkan paketmu' })).toBeInTheDocument();
    expect(getPaywallConfig).toHaveBeenCalledTimes(1);
  });

  it('opens the paywall from the upload quota error', async () => {
    render(
      wrap(
        <UploadErrorNotice code="quotaExceeded" limits={LIMITS} remaining={0} />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tingkatkan paket' }));

    expect(await screen.findByRole('dialog', { name: 'Tingkatkan paketmu' })).toBeInTheDocument();
  });

  it('does not show an upgrade button for other upload errors', () => {
    render(wrap(<UploadErrorNotice localError="fileTooLarge" limits={LIMITS} remaining={1} />));

    expect(screen.queryByRole('button', { name: 'Tingkatkan paket' })).not.toBeInTheDocument();
  });
});