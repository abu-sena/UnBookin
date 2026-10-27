import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnbookPageContent } from '@/components/reader/unbook-page-content';
import messages from '@/messages/id.json';
import { MODULE_ID, UNBOOK_ID, completedPath, samplePath, sourceProgress } from './fixtures';
import { renderWithIntl } from './render';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/sources/actions', () => ({ retrySourceProcessing: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Unbook page content', () => {
  it('keeps the processing view for every non-ready state', () => {
    renderWithIntl(
      <UnbookPageContent
        progress={sourceProgress({ unbookStatus: 'failed', stage: 'failed' })}
        path={null}
        deleteAction={<span>hapus</span>}
      />,
    );

    expect(screen.getByText(messages.sources.progress.failedFallback)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: messages.reader.unbook.pathTitle })).toBeNull();
    expect(screen.getByText('hapus')).toBeInTheDocument();
  });

  it('renders the path, progress and the Lanjutkan target once ready', () => {
    renderWithIntl(
      <UnbookPageContent
        progress={sourceProgress({ unbookStatus: 'ready', stage: 'ready', progressPct: 100 })}
        path={samplePath}
        deleteAction={<span>hapus</span>}
      />,
    );

    expect(screen.getByRole('heading', { name: samplePath.title })).toBeInTheDocument();
    expect(screen.getByText('0 dari 2 modul selesai')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.reader.unbook.continue })).toHaveAttribute(
      'href',
      `/unbook/${UNBOOK_ID}/module/${MODULE_ID}`,
    );
    expect(screen.queryByText('hapus')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Modul 1:/ }));
    expect(mocks.push).toHaveBeenCalledWith(`/unbook/${UNBOOK_ID}/module/${MODULE_ID}`);
  });

  it('shows the calm all-done state without a Lanjutkan button', () => {
    renderWithIntl(
      <UnbookPageContent
        progress={sourceProgress({ unbookStatus: 'ready', stage: 'ready', progressPct: 100 })}
        path={completedPath}
        deleteAction={null}
      />,
    );

    expect(screen.getByText(messages.reader.unbook.allDoneTitle)).toBeInTheDocument();
    expect(screen.getByText('2 dari 2 modul selesai')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: messages.reader.unbook.continue })).toBeNull();
  });
});
