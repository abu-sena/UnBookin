import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceExcerptSheet, SourceRef } from '@/components/module/source-ref';
import { renderWithIntl } from './render';

afterEach(cleanup);

vi.mock('@/components/layout/sheet', () => ({
  Sheet: ({
    open,
    onOpenChange,
    title,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button type="button" onClick={() => onOpenChange(false)}>
          Tutup
        </button>
        {children}
      </div>
    ) : null,
}));

describe('SourceRef chip', () => {
  it('shows the page number, or Sumber without one', () => {
    renderWithIntl(
      <div>
        <SourceRef page={42} excerpt={{ status: 'loading' }} />
        <SourceRef excerpt={{ status: 'loading' }} />
      </div>,
    );

    expect(screen.getByRole('button', { name: 'hlm. 42' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sumber' })).toBeInTheDocument();
  });

  it('opens the sheet once per open and shows the loading skeleton', () => {
    const onOpen = vi.fn();
    renderWithIntl(<SourceRef page={42} excerpt={{ status: 'loading' }} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'hlm. 42' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Memuat kutipan…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the ready excerpt with a page range, single page or no page', () => {
    const { unmount } = renderWithIntl(
      <SourceRef
        page={42}
        excerpt={{
          status: 'ready',
          excerpt: 'Level 5 leaders build enduring greatness.',
          pageFrom: 42,
          pageTo: 43,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'hlm. 42' }));
    expect(screen.getByText('Level 5 leaders build enduring greatness.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByText('hlm. 42–43'),
    ).toBeInTheDocument();
    unmount();

    const { unmount: unmountSingle } = renderWithIntl(
      <SourceRef
        page={7}
        excerpt={{ status: 'ready', excerpt: 'Satu halaman saja.', pageFrom: 7 }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'hlm. 7' }));
    expect(within(screen.getByRole('dialog')).getByText('hlm. 7')).toBeInTheDocument();
    unmountSingle();

    renderWithIntl(
      <SourceRef excerpt={{ status: 'ready', excerpt: 'Tanpa halaman.' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sumber' }));
    expect(
      within(screen.getByRole('dialog')).getByText('Nomor halaman tidak tersedia'),
    ).toBeInTheDocument();
  });
});

describe('SourceExcerptSheet', () => {
  it('announces errors and retries through the callback', () => {
    const onRetry = vi.fn();
    renderWithIntl(
      <SourceExcerptSheet
        open
        onOpenChange={() => undefined}
        excerpt={{ status: 'error' }}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Kutipan belum bisa dimuat. Coba lagi sebentar lagi, ya.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
