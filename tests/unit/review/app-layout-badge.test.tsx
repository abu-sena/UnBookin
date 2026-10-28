import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOnboardedUser: vi.fn(),
  countDueCards: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireOnboardedUser: mocks.requireOnboardedUser,
}));
vi.mock('@/lib/learning/queries', () => ({
  countDueCards: mocks.countDueCards,
}));
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({
    reviewCount,
    children,
  }: {
    reviewCount?: number;
    children: React.ReactNode;
  }) => (
    <div data-testid="shell" data-review-count={reviewCount ?? 'none'}>
      {children}
    </div>
  ),
}));

import { AuthenticatedApp } from '@/app/(app)/layout';

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOnboardedUser.mockResolvedValue({
    id: 'user-1',
    name: 'Sena',
    email: 'sena@example.com',
    image: null,
    role: 'user',
  });
});

describe('AuthenticatedApp review badge', () => {
  it('passes the due card count to the app shell', async () => {
    mocks.countDueCards.mockResolvedValue(14);

    render(await AuthenticatedApp({ children: <p>child</p> }));

    expect(screen.getByTestId('shell')).toHaveAttribute('data-review-count', '14');
    expect(mocks.countDueCards).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('renders no badge when counting fails', async () => {
    mocks.countDueCards.mockRejectedValue(new Error('db down'));

    render(await AuthenticatedApp({ children: <p>child</p> }));

    expect(screen.getByTestId('shell')).toHaveAttribute('data-review-count', 'none');
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
