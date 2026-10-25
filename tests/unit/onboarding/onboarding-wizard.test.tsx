import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveOnboarding: vi.fn(),
  track: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/lib/profile/actions', () => ({ saveOnboarding: mocks.saveOnboarding }));
vi.mock('@/lib/analytics/events', () => ({ track: mocks.track }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));

import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import messages from '@/messages/id.json';

const interests = [
  { slug: 'leadership-management', name: 'Kepemimpinan', description: 'Memimpin tim.' },
  { slug: 'habits', name: 'Kebiasaan', description: null },
  { slug: 'focus', name: 'Fokus', description: null },
  { slug: 'islamic-studies', name: 'Studi Islam', description: null },
];

function mount(initialName = '') {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <OnboardingWizard initialName={initialName} interests={interests} />
    </NextIntlClientProvider>,
  );
}

function nextButton() {
  return screen.getByRole('button', { name: messages.onboarding.next });
}

function goToInterestsStep() {
  fireEvent.click(nextButton());
  fireEvent.change(screen.getByLabelText(messages.profileForm.labels.jobRole), {
    target: { value: 'Manajer operasional' },
  });
  fireEvent.click(nextButton());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OnboardingWizard', () => {
  it('keeps Lanjut disabled until the current step is valid', () => {
    mount();
    expect(nextButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(messages.profileForm.labels.displayName), {
      target: { value: 'Sena' },
    });
    expect(nextButton()).toBeEnabled();

    fireEvent.click(nextButton());
    expect(screen.getByText(messages.onboarding.steps.role.title)).toBeInTheDocument();
  });

  it('keeps answers when going back', () => {
    mount('Sena');
    fireEvent.click(nextButton());
    fireEvent.change(screen.getByLabelText(messages.profileForm.labels.jobRole), {
      target: { value: 'Manajer operasional' },
    });

    fireEvent.click(screen.getByRole('button', { name: messages.onboarding.back }));

    expect(screen.getByLabelText(messages.profileForm.labels.displayName)).toHaveValue('Sena');
  });

  it('fills the role input from a quick suggestion chip', () => {
    mount('Sena');
    fireEvent.click(nextButton());
    fireEvent.click(
      screen.getByRole('button', { name: messages.profileForm.roleSuggestions.manager }),
    );

    expect(screen.getByLabelText(messages.profileForm.labels.jobRole)).toHaveValue('Manajer');
  });

  it('caps additional interests at two', () => {
    mount('Sena');
    goToInterestsStep();

    fireEvent.click(
      screen.getByRole('button', {
        name: messages.onboarding.primaryAria.replace('{name}', 'Kepemimpinan'),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.onboarding.additionalAria.replace('{name}', 'Kebiasaan'),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.onboarding.additionalAria.replace('{name}', 'Fokus'),
      }),
    );

    expect(
      screen.getByRole('button', {
        name: messages.onboarding.additionalAria.replace('{name}', 'Studi Islam'),
      }),
    ).toBeDisabled();
  });
});
