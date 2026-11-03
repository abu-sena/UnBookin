import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkillTree } from '@/components/game/skill-tree';
import messages from '@/messages/id.json';
import { makeDomain } from './fixtures';

vi.mock('@/components/layout/sheet', () => ({
  Sheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

afterEach(cleanup);

function mount(domains = [makeDomain()]) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <SkillTree interests={[{ id: 'i1', name: 'Kepemimpinan', slug: 'kep', domains }]} />
    </NextIntlClientProvider>,
  );
}

describe('SkillTree', () => {
  it('labels each domain button with name and level in text', () => {
    mount();
    expect(
      screen.getByRole('button', { name: 'Delegasi, level Pemula lanjut' }),
    ).toBeInTheDocument();
  });

  it('opens detail with exact backend next requirements and links', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Delegasi/ }));
    const dialog = screen.getByRole('dialog', { name: 'Delegasi' });
    expect(within(dialog).getByText('Menuju level Kompeten')).toBeInTheDocument();
    expect(within(dialog).getByText(/XP: 180 dari 500/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Kuis lulus: 2 dari 2/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Aksi terverifikasi: 0 dari 1/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Modul satu' })).toHaveAttribute(
      'href',
      '/unbook/u1/module/m1',
    );
    expect(within(dialog).getByRole('link', { name: 'Aksi satu' })).toHaveAttribute(
      'href',
      '/journal/a1',
    );
  });

  it('shows the max-level note and empty lists without requirements', () => {
    mount([makeDomain({ level: 'expert', nextRequirements: null, modules: [], actions: [] })]);
    fireEvent.click(screen.getByRole('button', { name: /Delegasi/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(messages.progress.domain.nextMax)).toBeInTheDocument();
    expect(within(dialog).getByText(messages.progress.domain.modulesEmpty)).toBeInTheDocument();
    expect(within(dialog).getByText(messages.progress.domain.actionsEmpty)).toBeInTheDocument();
  });
});
