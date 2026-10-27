import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeleteUnbookAction } from '@/components/sources/source-delete-button';
import type { DeletedUnbookResult, SourceActionResult } from '@/lib/sources/types';
import messages from '@/messages/id.json';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock('@/lib/sources/actions', () => ({ deleteMyUnbook: vi.fn() }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => true }));

import { SourceDeleteButton } from '@/components/sources/source-delete-button';

const copy = messages.sources.delete;

type ActionResult = SourceActionResult<DeletedUnbookResult>;

function createDeleteAction(overrides: Partial<Record<'impl', () => Promise<ActionResult>>> = {}) {
  const impl =
    overrides.impl ??
    (async () => ({ ok: true as const, data: { deleted: true as const } }) as ActionResult);
  return vi.fn(impl) as unknown as DeleteUnbookAction & ReturnType<typeof vi.fn>;
}

function deferred() {
  let settle!: (value: ActionResult) => void;
  const promise = new Promise<ActionResult>((res) => {
    settle = res;
  });
  return { promise, settle };
}

function mount(props: Partial<ComponentProps<typeof SourceDeleteButton>> = {}) {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <SourceDeleteButton unbookId="unbook-1" title="Atomic Habits" {...props} />
    </NextIntlClientProvider>,
  );
}

async function openSheet() {
  fireEvent.click(screen.getByRole('button', { name: copy.trigger }));
  await screen.findByRole('dialog');
}

function confirmButton() {
  // The destructive confirm swaps its label to `pending` while a delete runs.
  return within(screen.getByRole('dialog')).getByRole('button', {
    name: new RegExp(`^(${copy.confirm}|${copy.pending})$`),
  });
}

function cancelButton() {
  return within(screen.getByRole('dialog')).getByRole('button', { name: copy.cancel });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('source delete button', () => {
  it('never calls the action before confirmation and keeps the dialog after cancel', async () => {
    const deleteAction = createDeleteAction();
    mount({ deleteAction });
    await openSheet();

    expect(screen.getByText('Atomic Habits')).toBeInTheDocument();
    expect(deleteAction).not.toHaveBeenCalled();

    fireEvent.click(cancelButton());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deleteAction).not.toHaveBeenCalled();
  });

  it('guards duplicate confirms while a delete request is in flight', async () => {
    const pending = deferred();
    const deleteAction = vi.fn(() => pending.promise) as unknown as DeleteUnbookAction;
    mount({ deleteAction });
    await openSheet();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(confirmButton()).toBeDisabled());
    expect(screen.getByText(copy.pending)).toBeInTheDocument();
    expect(cancelButton()).toBeDisabled();

    fireEvent.click(confirmButton());
    expect(deleteAction).toHaveBeenCalledTimes(1);

    pending.settle({ ok: true, data: { deleted: true } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteAction).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('keeps the dialog with the error and allows retry when deletion fails', async () => {
    let attempts = 0;
    const deleteAction = createDeleteAction({
      impl: async () => {
        attempts += 1;
        return attempts === 1
          ? { ok: false as const, error: 'storageUnavailable' as const }
          : { ok: true as const, data: { deleted: true as const } };
      },
    });
    mount({ deleteAction });
    await openSheet();

    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(screen.getByText(copy.errors.storageUnavailable)).toBeInTheDocument(),
    );
    await waitFor(() => expect(confirmButton()).toBeEnabled());

    fireEvent.click(confirmButton());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteAction).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('sanitizes a thrown network error to processingFailed without leaking raw text', async () => {
    const deleteAction = createDeleteAction({
      impl: async () => {
        throw new Error('ECONNRESET raw socket sentinel');
      },
    });
    mount({ deleteAction });
    await openSheet();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(screen.getByText(copy.errors.processingFailed)).toBeInTheDocument());
    expect(screen.queryByText('ECONNRESET raw socket sentinel')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('redirects to the library only when returnToLibrary is set', async () => {
    const deleteAction = createDeleteAction();
    mount({ deleteAction, returnToLibrary: true });
    await openSheet();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/library'));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
