import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { requireUser } from '@/lib/auth/session';
import { getMyLearningProfile, getSelectableInterests } from '@/lib/profile/queries';

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-surface h-96 w-full animate-pulse rounded-[var(--radius-card)] motion-reduce:animate-none" />
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}

async function OnboardingContent() {
  const user = await requireUser('/onboarding');
  const profile = await getMyLearningProfile();
  if (profile?.onboardedAt) redirect('/home');
  const interests = await getSelectableInterests();

  return (
    <OnboardingWizard initialName={profile?.displayName ?? user.name ?? ''} interests={interests} />
  );
}
