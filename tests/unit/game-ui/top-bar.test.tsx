import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreakFlame } from '@/components/game/streak-flame';
import messages from '@/messages/id.json';

vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
afterEach(cleanup);

function mount(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('StreakFlame', () => {
  it('links to /progress with an accessible count and a 44px target', () => {
    mount(<StreakFlame count={5} activeToday />);
    const link = screen.getByRole('link', { name: /5 hari, sudah aktif hari ini/ });
    expect(link).toHaveAttribute('href', '/progress');
    expect(link.className).toContain('min-h-11');
    expect(link.className).toContain('min-w-11');
  });

  it('is muted when there is no activity today', () => {
    mount(<StreakFlame count={2} activeToday={false} />);
    const link = screen.getByRole('link', { name: /2 hari, belum aktif hari ini/ });
    expect(link.className).toContain('text-text-muted');
  });
});
