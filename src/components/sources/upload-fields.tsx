'use client';

import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SOURCE_TITLE_MAX } from '@/lib/sources/schema';
import { cn } from '@/lib/utils';

type UploadFieldsProps = {
  title: string;
  onTitleChange: (value: string) => void;
  interests: { slug: string; name: string }[];
  interestSlug: string;
  onInterestChange: (value: string) => void;
  rightsConfirmed: boolean;
  onRightsChange: (value: boolean) => void;
  disabled?: boolean;
  titleError?: string;
  interestError?: string;
  onTitleBlur?: () => void;
  onInterestBlur?: () => void;
};

export function UploadFields({
  title,
  onTitleChange,
  interests,
  interestSlug,
  onInterestChange,
  rightsConfirmed,
  onRightsChange,
  disabled = false,
  titleError,
  interestError,
  onTitleBlur,
  onInterestBlur,
}: UploadFieldsProps) {
  const t = useTranslations('sources.upload.fields');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="source-upload-title">{t('title')}</Label>
        <Input
          id="source-upload-title"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          onBlur={onTitleBlur}
          placeholder={t('titlePlaceholder')}
          maxLength={SOURCE_TITLE_MAX}
          autoComplete="off"
          disabled={disabled}
          className="min-h-11"
          aria-invalid={Boolean(titleError)}
          aria-describedby={titleError ? 'source-upload-title-error' : undefined}
        />
        {titleError ? (
          <p id="source-upload-title-error" className="text-danger text-small" role="alert">
            {titleError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="source-upload-interest">{t('interest')}</Label>
        <select
          id="source-upload-interest"
          value={interestSlug}
          onChange={(event) => onInterestChange(event.target.value)}
          onBlur={onInterestBlur}
          disabled={disabled}
          aria-invalid={Boolean(interestError)}
          aria-describedby={interestError ? 'source-upload-interest-error' : undefined}
          className={cn(
            'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50',
            'min-h-11 w-full min-w-0 rounded-md border bg-transparent px-3 text-base shadow-xs outline-none',
            'focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          )}
        >
          <option value="">{t('interestPlaceholder')}</option>
          {interests.map((interest) => (
            <option key={interest.slug} value={interest.slug}>
              {interest.name}
            </option>
          ))}
        </select>
        {interestError ? (
          <p id="source-upload-interest-error" className="text-danger text-small" role="alert">
            {interestError}
          </p>
        ) : null}
      </div>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="source-upload-rights"
          checked={rightsConfirmed}
          onCheckedChange={(value) => onRightsChange(value === true)}
          disabled={disabled}
          className="mt-0.5 size-5"
        />
        <Label
          htmlFor="source-upload-rights"
          className="min-h-11 cursor-pointer items-start gap-0 leading-snug"
        >
          {t('rights')}
        </Label>
      </div>
    </div>
  );
}
