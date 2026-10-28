import { getTranslations } from 'next-intl/server';
import { HomeSkeleton } from '@/components/home/home-skeleton';

export default async function HomeLoading() {
  const t = await getTranslations('pages');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t('home.title')}</h1>
      <HomeSkeleton />
    </div>
  );
}
