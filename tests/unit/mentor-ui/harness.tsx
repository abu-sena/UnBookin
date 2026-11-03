import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import messages from '@/messages/id.json';

export const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
export const MODULE_ID = 'd4e5f6a7-8b9c-4d0e-9f1a-2b3c4d5e6f70';
export const THREAD_ID = '11111111-1111-4111-8111-111111111111';
export const USER_MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
export const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
export const CHUNK_ID = '44444444-4444-4444-8444-444444444444';

export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}
