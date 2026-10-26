import { getTranslations } from 'next-intl/server';
import { LibraryFilterForm } from '@/components/library/library-filter-form';
import { LibraryResults } from '@/components/library/library-results';
import { PageHeader } from '@/components/ui-kit/page-header';
import { getMyLibrary } from '@/lib/library/query';
import { parseLibrarySearchParams, type LibrarySearchParams } from '@/lib/library/search-params';

type LibraryPageProps = {
  // Next.js 16: `searchParams` is async.
  searchParams: Promise<LibrarySearchParams>;
};

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const params = await searchParams;
  const [tPages, t] = await Promise.all([getTranslations('pages'), getTranslations('library')]);

  const filters = parseLibrarySearchParams(params);
  const data = await getMyLibrary(filters);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={tPages('library.title')} description={t('description')} />
      {data.hasAnyUnbooks ? (
        <LibraryFilterForm filters={data.filters} interests={data.interests} />
      ) : null}
      <LibraryResults items={data.items} hasAnyUnbooks={data.hasAnyUnbooks} />
    </div>
  );
}
