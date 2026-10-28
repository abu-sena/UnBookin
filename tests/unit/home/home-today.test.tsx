import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeToday, formatHomeDate, type HomeTodayProps } from '@/components/home/home-today';
import { SourceUploadContext } from '@/components/sources/upload-trigger';
import messages from '@/messages/id.json';

afterEach(cleanup);

const nowIso = '2026-10-28T05:00:00.000Z';

const baseProps: HomeTodayProps = {
  hasAnyUnbooks: true,
  reviewDue: 5,
  dueTomorrow: 2,
  nextModule: { title: 'Membangun sistem yang bertahan', href: '/unbook/u-1/module/m-1' },
  actions: [
    { id: 'a-1', title: 'Tulis satu kebiasaan kecil', dueAt: '2026-11-03T05:00:00.000Z' },
    { id: 'a-2', title: 'Minta umpan balik rekan', dueAt: '2026-10-20T05:00:00.000Z' },
  ],
  nowIso,
};

function mount(props: Partial<HomeTodayProps> = {}, openUpload = vi.fn()) {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <SourceUploadContext.Provider value={{ openUpload }}>
        <HomeToday {...baseProps} {...props} />
      </SourceUploadContext.Provider>
    </NextIntlClientProvider>,
  );
  return openUpload;
}

describe('HomeToday', () => {
  it('keeps the upload empty state when the user has no Unbook', () => {
    const openUpload = mount({ hasAnyUnbooks: false });

    expect(screen.getByText(messages.empty.homeMessage)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: messages.empty.homeAction }));
    expect(openUpload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(messages.home.today.title)).not.toBeInTheDocument();
  });

  it('shows review, the next module and the active actions when data exists', () => {
    mount();

    expect(screen.getByRole('heading', { name: messages.home.today.title })).toBeInTheDocument();
    expect(screen.getByText('5 kartu menunggu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.home.today.startReview })).toHaveAttribute(
      'href',
      '/review',
    );

    expect(screen.getByText(baseProps.nextModule!.title)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.home.today.continue })).toHaveAttribute(
      'href',
      baseProps.nextModule!.href,
    );

    expect(screen.getByText(baseProps.actions[0]!.title)).toBeInTheDocument();
    expect(screen.getByText(baseProps.actions[1]!.title)).toBeInTheDocument();
    expect(
      screen.getByText(
        messages.home.today.actionDue.replace(
          '{date}',
          formatHomeDate(baseProps.actions[0]!.dueAt!),
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        messages.home.today.actionOverdue.replace(
          '{date}',
          formatHomeDate(baseProps.actions[1]!.dueAt!),
        ),
      ),
    ).toBeInTheDocument();
  });

  it('lists at most three active actions', () => {
    mount({
      actions: [
        ...baseProps.actions,
        { id: 'a-3', title: 'Aksi ketiga', dueAt: null },
        { id: 'a-4', title: 'Aksi keempat', dueAt: null },
      ],
    });

    expect(screen.getByText('Aksi ketiga')).toBeInTheDocument();
    expect(screen.getByText(messages.home.today.actionNoDue)).toBeInTheDocument();
    expect(screen.queryByText('Aksi keempat')).not.toBeInTheDocument();
  });

  it('shows tomorrow\'s review line when nothing is due today', () => {
    mount({ reviewDue: 0, dueTomorrow: 2 });

    expect(screen.getByText(messages.home.today.reviewEmpty)).toBeInTheDocument();
    expect(screen.getByText('Review besok: 2 kartu')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: messages.home.today.startReview })).toBeNull();
  });
});
