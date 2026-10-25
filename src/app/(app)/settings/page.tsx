import { getTranslations } from 'next-intl/server';
import { SettingsList } from '@/components/settings/settings-list';
import { PageHeader } from '@/components/ui-kit/page-header';

export default async function SettingsPage() {
  const t = await getTranslations('settings');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <SettingsList />
    </div>
  );
}
