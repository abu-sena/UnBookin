import { useTranslations } from 'next-intl';

export default function Home() {
  const t = useTranslations('common');

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t('appName')}</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">{t('tagline')}</p>
    </main>
  );
}
