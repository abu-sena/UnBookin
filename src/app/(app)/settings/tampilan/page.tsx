import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronLeftIcon } from 'lucide-react';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { PageHeader } from '@/components/ui-kit/page-header';

export default async function AppearancePage() {
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
      <PageHeader title={t('rows.appearance')} description={t('appearanceDescription')} />
      <AppearanceSettings />
    </div>
  );
}
