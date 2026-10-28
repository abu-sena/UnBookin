import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { JournalDetailSkeleton } from '@/components/journal/journal-skeleton';

export default async function JournalDetailLoading() {
  const t = await getTranslations('journal.detailLoading');

  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-label={t('aria')}>
      <Link
        href="/journal"
        className="text-small text-text-muted hover:text-text inline-flex min-h-11 w-fit items-center gap-2"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>
      <h1 className="text-h1">{t('title')}</h1>
      <JournalDetailSkeleton />
    </div>
  );
}
