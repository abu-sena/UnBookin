import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceUploadAdapter } from '@/components/sources/source-action-adapter';
import messages from '@/messages/id.json';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  actions: {
    getSourceUploadContext: vi.fn(),
    prepareSourceUpload: vi.fn(),
    completeSourceUpload: vi.fn(),
    cancelSourceUpload: vi.fn(),
    createTextSource: vi.fn(),
    createUrlSource: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/sources/actions', () => mocks.actions);
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
    children: ReactNode;
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

import { SourceUploadProvider } from '@/components/sources/source-upload-provider';
import { SourceUploadTrigger } from '@/components/sources/upload-trigger';

const copy = messages.sources.upload;
const allowance = {
  planCode: 'free' as const,
  limits: {
    unbooksPerMonth: 8,
    unbooksFairUse: 40,
    maxPagesPerSource: 400,
    maxFileMb: 25,
    mentorMessagesPerMonth: null,
    originalsAccess: 'sample' as const,
    modelTier: 'economy' as const,
  },
  period: '2026-10',
  unbooksUsed: 2,
  unbooksPending: 0,
  remaining: 6,
};

function createAdapter(overrides: Partial<SourceUploadAdapter> = {}): SourceUploadAdapter {
  return {
    getContext: vi.fn(async () => ({
      ok: true as const,
      data: {
        interests: [
          { slug: 'habits', name: 'Kebiasaan' },
          { slug: 'focus', name: 'Fokus' },
        ],
        allowance,
      },
    })),
    prepareFileUpload: vi.fn(async () => ({
      ok: true as const,
      data: {
        sourceId: 'source-1',
        unbookId: 'unbook-1',
        uploadUrl: 'https://storage.test/source-1',
        mimeType: 'application/pdf',
      },
    })),
    uploadFile: vi.fn(async ({ onProgress }) => {
      onProgress(55);
    }),
    completeFileUpload: vi.fn(async () => ({
      ok: true as const,
      data: { unbookId: 'unbook-1' },
    })),
    cancelFileUpload: vi.fn(async () => ({
      ok: true as const,
      data: { cancelled: true as const },
    })),
    createTextSource: vi.fn(async () => ({
      ok: true as const,
      data: { unbookId: 'unbook-text' },
    })),
    createUrlSource: vi.fn(async () => ({
      ok: true as const,
      data: { unbookId: 'unbook-url' },
    })),
    ...overrides,
  };
}

function mount(adapter: SourceUploadAdapter) {
  const onNavigate = vi.fn();
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <SourceUploadProvider adapter={adapter} onNavigate={onNavigate}>
        <SourceUploadTrigger aria-label="Buka unggah" />
      </SourceUploadProvider>
    </NextIntlClientProvider>,
  );
  return { onNavigate };
}

async function openSheet(adapter: SourceUploadAdapter) {
  const mounted = mount(adapter);
  fireEvent.click(screen.getByRole('button', { name: 'Buka unggah' }));
  await waitFor(() => expect(adapter.getContext).toHaveBeenCalledTimes(1));
  return mounted;
}

function fillShared(options: { rights?: boolean } = {}) {
  fireEvent.change(screen.getByLabelText(copy.fields.title), {
    target: { value: 'Atomic Habits' },
  });
  fireEvent.change(screen.getByLabelText(copy.fields.interest), {
    target: { value: 'habits' },
  });
  if (options.rights) {
    fireEvent.click(screen.getByLabelText(copy.fields.rights));
  }
}

function chooseFile(name = 'buku.pdf') {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText(copy.fields.file), {
    target: { files: [file] },
  });
  return file;
}

function submitButton() {
  return screen.getByRole('button', { name: copy.actions.submit });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('upload sheet', () => {
  it('loads plan context lazily and reuses it when reopened', async () => {
    const adapter = createAdapter();
    mount(adapter);

    expect(adapter.getContext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Buka unggah' }));
    expect(screen.getByRole('dialog', { name: copy.title })).toBeInTheDocument();
    await waitFor(() => expect(adapter.getContext).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Sisa 6 dari 8 Unbook bulan ini')).toBeInTheDocument();
    expect(screen.getByText('Paket Gratis')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Buka unggah' }));
    expect(adapter.getContext).toHaveBeenCalledTimes(1);
  });

  it('requires rights before submitting and completes a file upload', async () => {
    const adapter = createAdapter();
    const { onNavigate } = await openSheet(adapter);
    fillShared();
    const file = chooseFile();

    expect(submitButton()).toBeDisabled();
    fillShared({ rights: true });
    expect(submitButton()).toBeEnabled();

    fireEvent.click(submitButton());
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('unbook-1'));

    expect(adapter.prepareFileUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Atomic Habits',
        filename: 'buku.pdf',
        mimeType: 'application/pdf',
        interestSlug: 'habits',
        rightsConfirmed: true,
      }),
    );
    expect(adapter.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ file }));
    expect(adapter.completeFileUpload).toHaveBeenCalledWith({ sourceId: 'source-1' });
  });

  it('reuses the prepared source when a failed finalize is retried', async () => {
    let attempts = 0;
    const complete = vi.fn(async () => {
      attempts += 1;
      return attempts === 1
        ? { ok: false as const, error: 'jobsUnavailable' as const }
        : { ok: true as const, data: { unbookId: 'unbook-1' } };
    });
    const adapter = createAdapter({ completeFileUpload: complete });
    const { onNavigate } = await openSheet(adapter);
    fillShared({ rights: true });
    chooseFile();
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByText(copy.recovery.queue)).toBeInTheDocument());
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: copy.actions.openLibrary })).toHaveAttribute(
      'href',
      '/library',
    );

    fireEvent.click(screen.getByRole('button', { name: copy.actions.retry }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('unbook-1'));
    expect(adapter.prepareFileUpload).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('cancels a source that was prepared after cancellation was requested', async () => {
    let resolvePrepare!: (
      value: Awaited<ReturnType<SourceUploadAdapter['prepareFileUpload']>>,
    ) => void;
    const prepare = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<SourceUploadAdapter['prepareFileUpload']>>>((resolve) => {
          resolvePrepare = resolve;
        }),
    );
    const cancel = vi.fn(async () => ({
      ok: true as const,
      data: { cancelled: true as const },
    }));
    const adapter = createAdapter({ prepareFileUpload: prepare, cancelFileUpload: cancel });
    const { onNavigate } = await openSheet(adapter);
    fillShared({ rights: true });
    chooseFile();
    fireEvent.click(submitButton());
    await waitFor(() => expect(prepare).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: copy.actions.cancelUpload }));
    resolvePrepare({
      ok: true,
      data: {
        sourceId: 'source-1',
        unbookId: 'unbook-1',
        uploadUrl: 'https://storage.test/source-1',
        mimeType: 'application/pdf',
      },
    });

    await waitFor(() => expect(cancel).toHaveBeenCalledWith({ sourceId: 'source-1' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adapter.uploadFile).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('keeps the sheet open when cleanup fails and allows retrying it', async () => {
    let cancelAttempts = 0;
    const cancel = vi.fn(async () => {
      cancelAttempts += 1;
      return cancelAttempts === 1
        ? { ok: false as const, error: 'storageUnavailable' as const }
        : { ok: true as const, data: { cancelled: true as const } };
    });
    const adapter = createAdapter({
      uploadFile: vi.fn(async () => {
        throw new Error('network');
      }),
      cancelFileUpload: cancel,
    });
    await openSheet(adapter);
    fillShared({ rights: true });
    chooseFile();
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByText(copy.errors.storageUnavailable)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: copy.actions.cancelUpload }));
    await waitFor(() => expect(screen.getByText(copy.recovery.cleanupFailed)).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: copy.actions.retryCleanup }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('shows the finalized recovery link when cancellation loses a race', async () => {
    let resolveComplete!: (
      value: Awaited<ReturnType<SourceUploadAdapter['completeFileUpload']>>,
    ) => void;
    const complete = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<SourceUploadAdapter['completeFileUpload']>>>((resolve) => {
          resolveComplete = resolve;
        }),
    );
    const adapter = createAdapter({
      completeFileUpload: complete,
      cancelFileUpload: vi.fn(async () => ({
        ok: false as const,
        error: 'invalidInput' as const,
      })),
    });
    const { onNavigate } = await openSheet(adapter);
    fillShared({ rights: true });
    chooseFile();
    fireEvent.click(submitButton());
    await waitFor(() => expect(complete).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: copy.actions.cancelUpload }));
    resolveComplete({ ok: false, error: 'processingFailed' });

    await waitFor(() => expect(screen.getByText(copy.recovery.finalized)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: copy.actions.openUnbook })).toHaveAttribute(
      'href',
      '/unbook/unbook-1',
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('asks before closing an active upload and cancels on confirm', async () => {
    let resolvePrepare!: (
      value: Awaited<ReturnType<SourceUploadAdapter['prepareFileUpload']>>,
    ) => void;
    const prepare = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<SourceUploadAdapter['prepareFileUpload']>>>((resolve) => {
          resolvePrepare = resolve;
        }),
    );
    const cancel = vi.fn(async () => ({
      ok: true as const,
      data: { cancelled: true as const },
    }));
    const adapter = createAdapter({ prepareFileUpload: prepare, cancelFileUpload: cancel });
    await openSheet(adapter);
    fillShared({ rights: true });
    chooseFile();
    fireEvent.click(submitButton());
    await waitFor(() => expect(prepare).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(screen.getByText(copy.close.title)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: copy.actions.cancelUpload,
      }),
    );
    resolvePrepare({
      ok: true,
      data: {
        sourceId: 'source-1',
        unbookId: 'unbook-1',
        uploadUrl: 'https://storage.test/source-1',
        mimeType: 'application/pdf',
      },
    });

    await waitFor(() => expect(cancel).toHaveBeenCalledWith({ sourceId: 'source-1' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Buka unggah' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('creates a URL source and navigates only after success', async () => {
    const adapter = createAdapter();
    const { onNavigate } = await openSheet(adapter);
    fireEvent.click(screen.getByRole('button', { name: copy.modes.url }));
    fillShared({ rights: true });
    fireEvent.change(screen.getByLabelText(copy.fields.url), {
      target: { value: 'https://example.com/artikel' },
    });
    fireEvent.click(submitButton());

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('unbook-url'));
    expect(adapter.createUrlSource).toHaveBeenCalledWith({
      title: 'Atomic Habits',
      url: 'https://example.com/artikel',
      interestSlug: 'habits',
      rightsConfirmed: true,
    });
  });

  it('validates pasted text before creating a text source', async () => {
    const adapter = createAdapter();
    const { onNavigate } = await openSheet(adapter);
    fireEvent.click(screen.getByRole('button', { name: copy.modes.text }));
    fillShared({ rights: true });

    expect(submitButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(copy.fields.text), {
      target: { value: 'Ringkasan bacaan yang akan dipelajari.' },
    });
    expect(submitButton()).toBeEnabled();
    fireEvent.click(submitButton());

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('unbook-text'));
    expect(adapter.createTextSource).toHaveBeenCalledWith({
      title: 'Atomic Habits',
      text: 'Ringkasan bacaan yang akan dipelajari.',
      interestSlug: 'habits',
      rightsConfirmed: true,
    });
  });
});
