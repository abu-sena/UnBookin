import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { usePathname } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/layout/bottom-nav';
import messages from '@/messages/id.json';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/home'),
}));

afterEach(cleanup);

const mockedUsePathname = vi.mocked(usePathname);

function renderBottomNav(reviewCount?: number) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <BottomNav reviewCount={reviewCount} />
    </NextIntlClientProvider>,
  );
}

describe('BottomNav', () => {
  beforeEach(() => {
    mockedUsePathname.mockReturnValue('/home');
  });

  it('renders the five navigation positions', () => {
    renderBottomNav();

    // Four destinations plus the central "Unbook" FAB.
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /Beranda/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pustaka/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Progres/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mulai Unbook baru' })).toBeInTheDocument();
  });

  it('marks the active route with aria-current="page"', () => {
    mockedUsePathname.mockReturnValue('/review');
    renderBottomNav();

    expect(screen.getByRole('link', { name: /Review/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Beranda/ })).not.toHaveAttribute('aria-current');
  });

  it('shows the review count badge when cards are due', () => {
    renderBottomNav(14);

    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('hides the review badge when nothing is due', () => {
    renderBottomNav(0);

    expect(screen.queryByText('14')).not.toBeInTheDocument();
  });

  it('gives the FAB an accessible name', () => {
    renderBottomNav();

    const fab = screen.getByRole('button', { name: 'Mulai Unbook baru' });
    expect(fab).toHaveAccessibleName('Mulai Unbook baru');
  });
});
