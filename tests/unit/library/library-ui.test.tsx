import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryCard } from '@/components/library/library-card';
import { LibraryFilterForm } from '@/components/library/library-filter-form';
import { LibraryResults } from '@/components/library/library-results';
import messages from '@/messages/id.json';
import type { LibraryItem, UnbookStatus } from '@/lib/library/types';

afterEach(cleanup);

const readyItem: LibraryItem = {
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

function mountCard(item: LibraryItem) {
  return mount(
    <ul>
      <LibraryCard item={item} />
    </ul>,
  );
}

describe('LibraryCard', () => {
  it('shows the title, author, interest, status and module reading progress', () => {
    mountCard(readyItem);

    expect(screen.getByRole('heading', { name: readyItem.title })).toBeInTheDocument();
    expect(screen.getByText(readyItem.author ?? '')).toBeInTheDocument();
    expect(screen.getByText(readyItem.interestName)).toBeInTheDocument();
    expect(screen.getByText(messages.library.status.ready)).toBeInTheDocument();
    expect(screen.getByText('3/8 modul')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Progres modul: 3 dari 8' }),
    ).toBeInTheDocument();
  });

  it('falls back to a localised author label and wraps very long text', () => {
    const longItem: LibraryItem = {
      ...readyItem,
      id: 'unbook-long',
      author: null,
      title:
        'Membangun Kebiasaan Membaca yang Bertahan Saat Pekerjaan Sedang Sangat Padat dan Tidak Ada Waktu Luang',
    };

    mountCard(longItem);

    expect(screen.getByText(messages.library.authorFallback)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: longItem.title })).toBeInTheDocument();
  });

  it('renders every real pipeline status with its localised label', () => {
    const statuses: UnbookStatus[] = ['queued', 'outlining', 'generating', 'ready', 'failed'];

    mount(
      <ul>
        {statuses.map((status) => (
          <LibraryCard key={status} item={{ ...readyItem, id: status, status }} />
        ))}
      </ul>,
    );

    for (const status of statuses) {
      expect(screen.getByText(messages.library.status[status])).toBeInTheDocument();
    }
  });
});

describe('LibraryResults', () => {
  it('explains a genuinely empty library without fake upload, delete or retry actions', () => {
    mount(<LibraryResults items={[]} hasAnyUnbooks={false} />);

    expect(screen.getByText(messages.library.empty.message)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers a real /library reset link when filters match nothing', () => {
    mount(<LibraryResults items={[]} hasAnyUnbooks={true} />);

    expect(screen.getByText(messages.library.noMatches.message)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.library.noMatches.reset })).toHaveAttribute(
      'href',
      '/library',
    );
  });

  it('renders one list item per Unbook', () => {
    mount(
      <LibraryResults
        items={[readyItem, { ...readyItem, id: 'unbook-2', title: 'Deep Work' }]}
        hasAnyUnbooks={true}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('LibraryFilterForm', () => {
  const interests = [
    { slug: 'habits', name: 'Kebiasaan' },
    { slug: 'leadership-management', name: 'Kepemimpinan dan Manajemen' },
  ];

  it('is a GET search form with labelled native controls and preserved values', () => {
    const { container } = mount(
      <LibraryFilterForm
        filters={{ q: 'Deep Work', interest: 'habits', status: 'ready' }}
        interests={interests}
      />,
    );

    const form = screen.getByRole('search', { name: messages.library.filters.label });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/library');

    expect(screen.getByLabelText(messages.library.filters.searchLabel)).toHaveValue('Deep Work');

    const interestSelect = screen.getByLabelText(messages.library.filters.interestLabel);
    expect(interestSelect).toHaveValue('habits');
    expect(interestSelect.querySelectorAll('option')).toHaveLength(interests.length + 1);

    const statusSelect = screen.getByLabelText(messages.library.filters.statusLabel);
    expect(statusSelect).toHaveValue('ready');
    expect(statusSelect.querySelectorAll('option')).toHaveLength(6);

    expect(screen.getByRole('button', { name: messages.library.filters.apply })).toBeEnabled();
    expect(screen.getByRole('link', { name: messages.library.filters.reset })).toHaveAttribute(
      'href',
      '/library',
    );
    expect(container.querySelectorAll('select')).toHaveLength(2);
  });

  it('does not show a reset link when no filter is active', () => {
    mount(
      <LibraryFilterForm filters={{ q: '', interest: '', status: '' }} interests={interests} />,
    );

    expect(screen.queryByRole('link')).toBeNull();
  });
});
