import { fireEvent, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import messages from '@/messages/id.json';
import { MODULE_ID } from './fixtures';
import { flush, mocks, renderReader, triggerReaderEnd } from './reader-harness';

const tabs = messages.reader.module.tabs;

async function reachEnd() {
  await act(async () => {
    triggerReaderEnd();
    await Promise.resolve();
  });
}

describe('ModuleReader reading rule', () => {
  it('marks reading once on open and read only after both conditions', async () => {
    renderReader();
    await flush();

    expect(mocks.actions.markModuleReading).toHaveBeenCalledTimes(1);
    expect(mocks.actions.markModuleReading).toHaveBeenCalledWith({ moduleId: MODULE_ID });

    await reachEnd();
    expect(mocks.actions.markModuleRead).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: tabs.apply }));
    await flush();

    expect(mocks.actions.markModuleRead).toHaveBeenCalledTimes(1);
    expect(mocks.actions.markModuleRead).toHaveBeenCalledWith({ moduleId: MODULE_ID });
    expect(screen.getByText('+20 XP')).toBeInTheDocument();

    await reachEnd();
    fireEvent.click(screen.getByRole('tab', { name: tabs.understand }));
    await flush();
    expect(mocks.actions.markModuleRead).toHaveBeenCalledTimes(1);
  });

  it('does not downgrade or re-award a module that is already read', async () => {
    renderReader({ status: 'read' });
    await flush();
    await reachEnd();
    fireEvent.click(screen.getByRole('tab', { name: tabs.apply }));
    await flush();

    expect(mocks.actions.markModuleReading).not.toHaveBeenCalled();
    expect(mocks.actions.markModuleRead).not.toHaveBeenCalled();
    expect(screen.getByText(messages.reader.module.readDone)).toBeInTheDocument();
  });
});
