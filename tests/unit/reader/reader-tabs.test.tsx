import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import messages from '@/messages/id.json';
import { MODULE_ID } from './fixtures';
import { mocks, renderReader } from './reader-harness';

const tabs = messages.reader.module.tabs;

describe('ModuleReader tabs', () => {
  it('keeps the tab list in sync with clicks, keyboard and horizontal scroll', () => {
    renderReader();

    expect(screen.getByRole('tab', { name: tabs.understand })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.click(screen.getByRole('tab', { name: tabs.apply }));
    expect(screen.getByRole('tab', { name: tabs.apply })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: tabs.understand })).toHaveAttribute(
      'aria-selected',
      'false',
    );

    const applyTab = screen.getByRole('tab', { name: tabs.apply });
    applyTab.focus();
    fireEvent.keyDown(applyTab, { key: 'ArrowRight' });
    const proveTab = screen.getByRole('tab', { name: tabs.prove });
    expect(proveTab).toHaveAttribute('aria-selected', 'true');
    expect(proveTab).toHaveFocus();

    const scroller = document.querySelector('[data-slot="reader-panels"]');
    expect(scroller).not.toBeNull();
    if (!scroller) return;
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 375 });
    Object.defineProperty(scroller, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 0,
    });
    fireEvent.scroll(scroller);

    expect(screen.getByRole('tab', { name: tabs.understand })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('records every layer switch and shows the practitioner concepts', () => {
    renderReader();

    const practitionerTab = screen.getByRole('tab', {
      name: messages.module.layerToggle.layers.practitioner,
    });
    fireEvent.click(practitionerTab);

    expect(mocks.actions.recordDeepestLayer).toHaveBeenCalledWith({
      moduleId: MODULE_ID,
      layer: 'practitioner',
    });
    expect(screen.getByText('Sistem kerja yang jelas')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: messages.module.layerToggle.layers.eli5 }));
    expect(mocks.actions.recordDeepestLayer).toHaveBeenLastCalledWith({
      moduleId: MODULE_ID,
      layer: 'eli5',
    });
  });
});
