import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import messages from '@/messages/id.json';
import { MODULE_ID, NEXT_MODULE_ID, UNBOOK_ID, sampleContent } from './fixtures';
import { flush, mocks, renderReader } from './reader-harness';

const tabs = messages.reader.module.tabs;

describe('ModuleReader Terapkan tab', () => {
  it('rolls a checklist toggle back when saving fails', async () => {
    mocks.actions.saveChecklist.mockResolvedValueOnce({ ok: false, code: 'failed' });
    renderReader();

    fireEvent.click(screen.getByRole('tab', { name: tabs.apply }));
    const firstItem = sampleContent.application.tools[0]?.items[0] ?? '';
    const checkbox = screen.getByRole('checkbox', { name: firstItem });

    fireEvent.click(checkbox);
    expect(mocks.actions.saveChecklist).toHaveBeenCalledWith({
      moduleId: MODULE_ID,
      toolIndex: 0,
      checkedIndices: [0],
    });

    await flush();
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.reader.module.apply.checklistSaveError,
    );
  });

  it('renders non-checklist tools as a plain list', () => {
    renderReader();
    fireEvent.click(screen.getByRole('tab', { name: tabs.apply }));

    expect(screen.getByRole('heading', { name: 'Daftar pertanyaan refleksi' })).toBeInTheDocument();
    expect(screen.getByText('Apa yang berjalan baik?')).toBeInTheDocument();
  });

  it('keeps the created state when a planned action already exists', () => {
    renderReader({ plannedActionId: 'existing-action-id' });
    fireEvent.click(screen.getByRole('tab', { name: tabs.apply }));

    const created = screen.getByRole('button', { name: messages.module.action.created });
    expect(created).toBeDisabled();
    expect(mocks.actions.createActionFromModule).not.toHaveBeenCalled();
  });

  it('creates the weekly action once and shows the +7 day due date', async () => {
    renderReader();
    fireEvent.click(screen.getByRole('tab', { name: tabs.apply }));

    fireEvent.click(screen.getByRole('button', { name: messages.module.action.cta }));
    await flush();

    expect(mocks.actions.createActionFromModule).toHaveBeenCalledWith({ moduleId: MODULE_ID });
    expect(screen.getByRole('button', { name: messages.module.action.created })).toBeDisabled();
    expect(screen.getByText(/Tenggat 4 November 2026/)).toBeInTheDocument();
  });

  it('links to the next module once this one is read', () => {
    renderReader({ status: 'read' });

    expect(screen.getByRole('link', { name: messages.reader.module.nextModule })).toHaveAttribute(
      'href',
      `/unbook/${UNBOOK_ID}/module/${NEXT_MODULE_ID}`,
    );
    expect(screen.getByRole('link', { name: messages.reader.module.back })).toHaveAttribute(
      'href',
      `/unbook/${UNBOOK_ID}`,
    );
  });
});
