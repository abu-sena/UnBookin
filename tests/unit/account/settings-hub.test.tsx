import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsList } from '@/components/settings/settings-list';
import messages from '@/messages/id.json';

afterEach(cleanup);

function mount() {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <SettingsList />
    </NextIntlClientProvider>,
  );
}

describe('SettingsList', () => {
  it('renders six rows with four marked as coming soon', () => {
    const { container } = mount();

    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getAllByText(messages.settings.comingSoon)).toHaveLength(4);
    expect(container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(4);
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('links the two live rows to their settings pages', () => {
    mount();

    expect(
      screen.getByRole('link', { name: new RegExp(messages.settings.rows.learningProfile) }),
    ).toHaveAttribute('href', '/settings/profil-belajar');
    expect(
      screen.getByRole('link', { name: new RegExp(messages.settings.rows.appearance) }),
    ).toHaveAttribute('href', '/settings/tampilan');
  });
});
