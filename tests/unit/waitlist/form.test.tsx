import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ action: vi.fn(), track: vi.fn() }));
vi.mock('@/lib/waitlist/actions', () => ({
  joinWaitlist: mocks.action,
  getWaitlistPriceVariant: async () => 'B',
}));
vi.mock('@/lib/waitlist/analytics', () => ({ trackWaitlistJoined: mocks.track }));
import { WaitlistForm } from '@/components/marketing/waitlist-form';
import messages from '@/messages/id.json';
import { interestSeeds } from '@/db/seed-data';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount() {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <WaitlistForm interests={interestSeeds.filter((row) => row.slug !== 'general')} />
    </NextIntlClientProvider>,
  );
}
it('renders three accessible interest radio chips and email input', () => {
  mount();
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  expect(screen.getByRole('group', { name: messages.waitlist.interestLegend })).toBeInTheDocument();
  expect(screen.getByLabelText(messages.waitlist.emailLabel)).toHaveAttribute('type', 'email');
  expect(screen.getByLabelText(messages.waitlist.website)).toHaveAttribute('tabindex', '-1');
});
it('replaces form with position, share link and WhatsApp after success', async () => {
  mocks.action.mockResolvedValue({ status: 'success', position: 23, referralCode: 'ABCDef23' });
  mount();
  fireEvent.change(screen.getByLabelText(messages.waitlist.emailLabel), {
    target: { value: 'person@example.com' },
  });
  fireEvent.click(screen.getAllByRole('radio')[0]!);
  await act(async () => {
    fireEvent.submit(
      screen.getByRole('button', { name: messages.waitlist.submit }).closest('form')!,
    );
  });
  expect(screen.getByText('Kamu di antrean ke-23')).toBeInTheDocument();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect((screen.getByLabelText(messages.waitlist.shareLabel) as HTMLInputElement).value).toContain(
    '/?ref=ABCDef23',
  );
  expect(screen.getByRole('link', { name: messages.waitlist.whatsapp })).toHaveAttribute(
    'href',
    expect.stringContaining('https://wa.me/?text='),
  );
  expect(mocks.track).toHaveBeenCalledWith('leadership-management', 'B');
});
