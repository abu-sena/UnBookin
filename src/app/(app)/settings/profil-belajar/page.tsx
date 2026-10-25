import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { ChevronLeftIcon } from 'lucide-react';
import { LearningProfileForm } from '@/components/settings/learning-profile-form';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui-kit/page-header';
import { getMyLearningProfile, getSelectableInterests } from '@/lib/profile/queries';

export default async function LearningProfilePage() {
  const t = await getTranslations('settings');

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/settings"
        className="text-small text-text-muted hover:text-text inline-flex min-h-11 w-fit items-center gap-1"
      >
        <ChevronLeftIcon className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>
      <PageHeader title={t('rows.learningProfile')} description={t('learningProfileDescription')} />
      <Suspense fallback={<LearningProfileSkeleton />}>
        <LearningProfileData />
      </Suspense>
    </div>
  );
}

async function LearningProfileData() {
  // The queries read the session; defer to request time so the stubs never run at build time.
  await connection();
  const [profile, interests] = await Promise.all([
    getMyLearningProfile(),
    getSelectableInterests(),
  ]);

  return <LearningProfileForm profile={profile} interests={interests} />;
}

function LearningProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((key) => (
        <div key={key} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 w-full rounded-[var(--radius-input)]" />
        </div>
      ))}
      <Skeleton className="h-11 w-full rounded-[var(--radius-button)]" />
    </div>
  );
}
