import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import messages from '@/messages/id.json';

export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

export function renderWithIntlAsync(ui: ReactElement) {
  return renderWithIntl(ui);
}
