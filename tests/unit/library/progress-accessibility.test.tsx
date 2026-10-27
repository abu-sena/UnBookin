import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryCard } from '@/components/library/library-card';
import { Progress } from '@/components/ui/progress';
import messages from '@/messages/id.json';
import type { LibraryItem } from '@/lib/library/types';

vi.mock('@/lib/sources/actions', () => ({ deleteMyUnbook: vi.fn() }));

afterEach(cleanup);

const item: LibraryItem = {
  id: 'unbook-1',
  title: 'Good to Great',
  author: 'Jim Collins',
  interestName: 'Kepemimpinan dan Manajemen',
  interestSlug: 'leadership-management',
  status: 'ready',
  modulesRead: 3,
  moduleCount: 8,
};

function mount(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      {children}
    </NextIntlClientProvider>,
  );
}

function mountCard(overrides: Partial<LibraryItem> = {}) {
  return mount(
    <ul>
      <LibraryCard item={{ ...item, ...overrides }} />
    </ul>,
  );
}

describe('LibraryCard progress accessibility', () => {
  it('exposes determinate module progress as a percentage', () => {
    mountCard();

    expect(screen.getByText('3/8 modul')).toBeInTheDocument();
    const progressbar = screen.getByRole('progressbar', { name: 'Progres modul: 3 dari 8' });
    expect(progressbar).toHaveAttribute('aria-valuenow', '38');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });

  it('reports zero progress when the Unbook has no modules', () => {
    mountCard({ modulesRead: 0, moduleCount: 0 });

    const progressbar = screen.getByRole('progressbar', { name: 'Progres modul: 0 dari 0' });
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });
});

describe('Progress value semantics', () => {
  it('is determinate at zero', () => {
    mount(<Progress value={0} aria-label="Zero" />);

    const progressbar = screen.getByRole('progressbar', { name: 'Zero' });
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });

  it('is determinate at one hundred', () => {
    mount(<Progress value={100} aria-label="Full" />);

    const progressbar = screen.getByRole('progressbar', { name: 'Full' });
    expect(progressbar).toHaveAttribute('aria-valuenow', '100');
  });

  it('stays indeterminate when no value is supplied', () => {
    mount(<Progress aria-label="Indeterminate" />);

    const progressbar = screen.getByRole('progressbar', { name: 'Indeterminate' });
    expect(progressbar).not.toHaveAttribute('aria-valuenow');
    expect(progressbar).toHaveAttribute('data-state', 'indeterminate');
  });
});
