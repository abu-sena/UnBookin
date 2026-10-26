'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LIBRARY_QUERY_MAX_LENGTH, hasActiveLibraryFilters } from '@/lib/library/search-params';
import {
  UNBOOK_STATUSES,
  type LibraryFilters,
  type LibraryInterestOption,
} from '@/lib/library/types';

const selectClassName =
  'border-border bg-surface-2 text-text focus-visible:border-ring focus-visible:ring-ring/50 min-h-11 w-full rounded-[var(--radius-input)] border px-3 text-base outline-none focus-visible:ring-[3px]';

type LibraryFilterFormProps = {
  filters: LibraryFilters;
  interests: LibraryInterestOption[];
};

/**
 * E2-03 AC2: a plain GET form, so filtering works without client state and the
 * URL stays shareable. Submitted values are preserved in the controls and the
 * reset action is a real `/library` link.
 */
export function LibraryFilterForm({ filters, interests }: LibraryFilterFormProps) {
  const t = useTranslations('library');
  const active = hasActiveLibraryFilters(filters);

  return (
    <form
      action="/library"
      method="get"
      role="search"
      aria-label={t('filters.label')}
      className="border-border bg-surface flex flex-col gap-4 rounded-[var(--radius-card)] border p-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="library-search">{t('filters.searchLabel')}</Label>
        <Input
          id="library-search"
          name="q"
          type="search"
          defaultValue={filters.q}
          maxLength={LIBRARY_QUERY_MAX_LENGTH}
          placeholder={t('filters.searchPlaceholder')}
          className="min-h-11"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="library-interest">{t('filters.interestLabel')}</Label>
          <select
            id="library-interest"
            name="interest"
            defaultValue={filters.interest}
            className={selectClassName}
          >
            <option value="">{t('filters.allInterests')}</option>
            {interests.map((interest) => (
              <option key={interest.slug} value={interest.slug}>
                {interest.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="library-status">{t('filters.statusLabel')}</Label>
          <select
            id="library-status"
            name="status"
            defaultValue={filters.status}
            className={selectClassName}
          >
            <option value="">{t('filters.allStatuses')}</option>
            {UNBOOK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">{t('filters.apply')}</Button>
        {active ? (
          <Button asChild variant="ghost">
            <a href="/library">{t('filters.reset')}</a>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
