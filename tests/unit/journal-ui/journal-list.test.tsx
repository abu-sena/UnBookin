import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/id.json';

const mocks = vi.hoisted(() => ({
  updateActionStatus: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/lib/journal/actions', () => ({ updateActionStatus: mocks.updateActionStatus }));
vi.mock('@/components/layout/sheet', () => ({
  Sheet: ({
    open,
    onOpenChange,
    title,
    description,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children: ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button type="button" onClick={() => onOpenChange(false)}>
          {messages.journal.skipDialog.cancel}
        </button>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
    ) : null,
}));

import { formatJournalDate, JournalActionCard } from '@/components/journal/journal-action-card';
import { JournalView } from '@/components/journal/journal-view';
import { actionId, makeAction, nowIso } from './fixtures';

const copy = messages.journal;

function tabLabel(label: string, count: number) {
  return copy.tabs.withCount.replace('{label}', label).replace('{count}', String(count));
}

function mount(actions = [makeAction()]) {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <JournalView actions={actions} nowIso={nowIso} />
    </NextIntlClientProvider>,
  );
}

function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('JournalView tabs', () => {
  it('renders three accessible tabs with live counts', () => {
    mount([
      makeAction(),
      makeAction({ id: 'action-done', title: 'Aksi selesai', status: 'done', canReport: false }),
      makeAction({
        id: 'action-skipped',
        title: 'Aksi dilewati',
        status: 'skipped',
        canReport: false,
      }),
    ]);

    expect(screen.getByRole('tablist', { name: copy.tabs.label })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: tabLabel(copy.tabs.active, 1) })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: tabLabel(copy.tabs.done, 1) })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: tabLabel(copy.tabs.skipped, 1) })).toBeInTheDocument();
  });

  it('shows a real library CTA in every empty tab', () => {
    mount([]);

    for (const tab of ['active', 'done', 'skipped'] as const) {
      openTab(tabLabel(copy.tabs[tab], 0));
      expect(screen.getByText(copy.empty[tab].message)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: copy.empty[tab].action })).toHaveAttribute(
        'href',
        '/library',
      );
    }
  });
});

describe('JournalActionCard', () => {
  it('links the title and module, formats the due date and marks an overdue deadline calmly', () => {
    const action = makeAction({ dueAt: '2026-10-20T05:00:00.000Z' });
    render(
      <NextIntlClientProvider locale="id" messages={messages}>
        <JournalActionCard action={action} nowIso={nowIso} onUpdated={vi.fn()} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('link', { name: action.title })).toHaveAttribute(
      'href',
      `/journal/${action.id}`,
    );
    expect(screen.getByRole('link', { name: action.moduleTitle })).toHaveAttribute(
      'href',
      `/unbook/${action.unbookId}/module/${action.moduleId}`,
    );
    expect(
      screen.getByText(copy.due.replace('{date}', formatJournalDate(action.dueAt!))),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.overdue)).toBeInTheDocument();
    expect(screen.getByText(copy.overdueNote)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.actions.report })).toHaveAttribute(
      'href',
      `/journal/${action.id}`,
    );
  });

  it('extends a planned action and shows the server-returned due date', async () => {
    const newDue = '2026-11-10T05:00:00.000Z';
    mocks.updateActionStatus.mockResolvedValue({
      ok: true,
      status: 'planned',
      dueAt: new Date(newDue),
    });
    mount([makeAction()]);

    fireEvent.click(screen.getByRole('button', { name: copy.actions.extend }));

    await waitFor(() =>
      expect(mocks.updateActionStatus).toHaveBeenCalledWith({
        actionId,
        operation: 'extend',
      }),
    );
    expect(
      screen.getByText(copy.due.replace('{date}', formatJournalDate(newDue))),
    ).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('confirms a skip, then moves the action to the skipped tab', async () => {
    mocks.updateActionStatus.mockResolvedValue({ ok: true, status: 'skipped', dueAt: null });
    mount([makeAction()]);

    fireEvent.click(screen.getByRole('button', { name: copy.actions.skip }));
    const dialog = screen.getByRole('dialog', { name: copy.skipDialog.title });
    expect(within(dialog).getByText(copy.skipDialog.description)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: copy.skipDialog.confirm }));

    await waitFor(() => expect(mocks.updateActionStatus).toHaveBeenCalledTimes(1));
    expect(mocks.updateActionStatus).toHaveBeenCalledWith({ actionId, operation: 'skip' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: copy.skipDialog.title })).toBeNull(),
    );

    expect(screen.getByText(copy.empty.active.message)).toBeInTheDocument();
    openTab(tabLabel(copy.tabs.skipped, 1));
    expect(screen.getByRole('link', { name: makeAction().title })).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the confirmation open with a safe error when skipping fails', async () => {
    mocks.updateActionStatus.mockResolvedValue({ ok: false, code: 'unexpected' });
    mount([makeAction()]);

    fireEvent.click(screen.getByRole('button', { name: copy.actions.skip }));
    const dialog = screen.getByRole('dialog', { name: copy.skipDialog.title });
    fireEvent.click(within(dialog).getByRole('button', { name: copy.skipDialog.confirm }));

    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(copy.errors.skip),
    );
    expect(screen.getByRole('dialog', { name: copy.skipDialog.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: makeAction().title })).toBeInTheDocument();
  });
});
