import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('@/lib/profile/actions', () => ({ updateLearningProfile: mocks.update }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

import { LearningProfileForm } from '@/components/settings/learning-profile-form';
import messages from '@/messages/id.json';

const interests = [
  { slug: 'leadership-management', name: 'Kepemimpinan dan Manajemen', description: null },
  { slug: 'personal-development-productivity', name: 'Pengembangan Diri', description: null },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mount() {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <LearningProfileForm profile={null} interests={interests} />
    </NextIntlClientProvider>,
  );
}

describe('LearningProfileForm', () => {
  it('shows a field error from the action and keeps the typed values', async () => {
    mocks.update.mockResolvedValue({
      status: 'error',
      messageKey: 'invalidInput',
      fieldErrors: { jobRole: 'jobRole' },
    });

    mount();
    const jobRole = screen.getByLabelText(messages.profileForm.labels.jobRole);
    fireEvent.change(jobRole, { target: { value: 'Manajer Produk' } });

    await act(async () => {
      fireEvent.submit(
        screen.getByRole('button', { name: messages.profileForm.save }).closest('form')!,
      );
    });

    expect(screen.getByText(messages.profileForm.errors.jobRole)).toBeInTheDocument();
    expect((jobRole as HTMLInputElement).value).toBe('Manajer Produk');
  });
});
