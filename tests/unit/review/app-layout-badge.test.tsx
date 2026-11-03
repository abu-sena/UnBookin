import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOnboardedUser: vi.fn(),
  countDueCards: vi.fn(),
  getGameSummary: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireOnboardedUser: mocks.requireOnboardedUser,
}));
vi.mock('@/lib/learning/queries', () => ({
  countDueCards: mocks.countDueCards,
}));
vi.mock('@/lib/game/queries', () => ({
  getGameSummary: mocks.getGameSummary,
}));
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({
    reviewCount,
    gameSummary,
    gameUserId,
    children,
  }: {
    reviewCount?: number;
    gameSummary?: { currentStreak: number; activeToday: boolean };
    gameUserId?: string;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="shell"
      data-review-count={reviewCount ?? 'none'}
      data-streak={gameSummary?.currentStreak ?? 'none'}
      data-active={String(gameSummary?.activeToday ?? 'none')}
      data-game-user={gameUserId ?? 'none'}
    >
      {children}
    </div>
  ),
}));

import { AuthenticatedApp } from '@/app/(app)/layout';

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getGameSummary.mockResolvedValue({ currentStreak: 4, activeToday: true });
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

  it('passes the game summary using the trusted session user id', async () => {
    mocks.countDueCards.mockResolvedValue(1);

    render(await AuthenticatedApp({ children: <p>child</p> }));

    const shell = screen.getByTestId('shell');
    expect(mocks.getGameSummary).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(shell).toHaveAttribute('data-streak', '4');
    expect(shell).toHaveAttribute('data-active', 'true');
    expect(shell).toHaveAttribute('data-game-user', 'user-1');
  });

  it('survives a failing game query and keeps the review badge', async () => {
    mocks.countDueCards.mockResolvedValue(7);
    mocks.getGameSummary.mockRejectedValue(new Error('stats down'));

    render(await AuthenticatedApp({ children: <p>child</p> }));

    const shell = screen.getByTestId('shell');
    expect(shell).toHaveAttribute('data-streak', 'none');
    expect(shell).toHaveAttribute('data-review-count', '7');
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
