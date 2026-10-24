import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { ModuleDemo } from '@/components/marketing/module-demo';
import messages from '@/messages/id.json';

afterEach(cleanup);

function renderModuleDemo() {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <ModuleDemo />
    </NextIntlClientProvider>,
  );
}

describe('ModuleDemo', () => {
  it('exposes the layer toggle as a tablist with accessible names', () => {
    renderModuleDemo();

    const tablist = screen.getByRole('tablist', { name: 'Pilih tingkat penjelasan' });
    expect(tablist).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Sederhana', 'Praktisi', 'Ahli']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
  });

  it('switches the layer text when another level is clicked', () => {
    renderModuleDemo();

    const sederhanaBody = messages.landing.demo.layers.sederhana.body;
    const praktisiBody = messages.landing.demo.layers.praktisi.body;

    expect(screen.getByText(sederhanaBody).closest('[role="tabpanel"]')).toHaveAttribute(
      'data-active',
      'true',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Praktisi' }));

    const praktisiPanel = screen.getByText(praktisiBody).closest('[role="tabpanel"]');
    expect(praktisiPanel).toHaveAttribute('data-active', 'true');
    expect(praktisiPanel).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText(sederhanaBody).closest('[role="tabpanel"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Praktisi' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the sample weekly action card', () => {
    renderModuleDemo();

    expect(screen.getByText('Aksi Minggu Ini')).toBeInTheDocument();
    expect(screen.getByText(messages.landing.demo.actionCard.title)).toBeInTheDocument();
  });
});
