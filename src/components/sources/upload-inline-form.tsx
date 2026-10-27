'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PlanLimits } from '@/lib/billing/plan-limits';
import {
  SOURCE_TEXT_MAX_CHARACTERS,
  sourceTextInputSchema,
  sourceUrlInputSchema,
} from '@/lib/sources/schema';
import type { SourceErrorCode } from '@/lib/sources/types';
import type { SourceUploadAdapter } from './source-action-adapter';
import { UploadErrorNotice } from './upload-error-notice';
import { validateSourceText, type ClientSourceError } from './upload-limits';

type InlineMode = 'url' | 'text';

type UploadInlineFormProps = {
  mode: InlineMode;
  adapter: SourceUploadAdapter;
  limits: PlanLimits;
  remaining: number;
  title: string;
  interestSlug: string;
  sharedValid: boolean;
  onActiveChange: (active: boolean) => void;
  onUploaded: (unbookId: string) => void;
};

export function UploadInlineForm({
  mode,
  adapter,
  limits,
  remaining,
  title,
  interestSlug,
  sharedValid,
  onActiveChange,
  onUploaded,
}: UploadInlineFormProps) {
  const t = useTranslations('sources.upload');
  const [value, setValue] = useState('');
  const [localMessage, setLocalMessage] = useState<'url' | 'text' | null>(null);
  const [localLimit, setLocalLimit] = useState<ClientSourceError | null>(null);
  const [code, setCode] = useState<SourceErrorCode | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  const pendingRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    onActiveChange(pending);
  }, [pending, onActiveChange]);

  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    [],
  );

  function submit() {
    if (pendingRef.current || !sharedValid || value.trim().length === 0) return;
    if (code === 'jobsUnavailable') return;

    setLocalMessage(null);
    setLocalLimit(null);
    setCode(null);

    const shared = {
      title: title.trim(),
      interestSlug,
      rightsConfirmed: true as const,
    };
    let createSource: () => ReturnType<SourceUploadAdapter['createUrlSource']>;

    if (mode === 'url') {
      const parsed = sourceUrlInputSchema.safeParse({ ...shared, url: value.trim() });
      if (!parsed.success) {
        setLocalMessage('url');
        return;
      }
      createSource = () => adapter.createUrlSource(parsed.data);
    } else {
      const parsed = sourceTextInputSchema.safeParse({ ...shared, text: value });
      if (!parsed.success) {
        setLocalLimit(validateSourceText(value, limits) ?? 'invalidInput');
        setLocalMessage('text');
        return;
      }
      createSource = () => adapter.createTextSource(parsed.data);
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    pendingRef.current = true;
    setPending(true);

    startTransition(async () => {
      try {
        const result = await createSource();
        if (generation !== generationRef.current) return;
        if (!result.ok) {
          setCode(result.error);
          return;
        }
        onUploaded(result.data.unbookId);
      } catch {
        if (generation === generationRef.current) setCode('processingFailed');
      } finally {
        if (generation === generationRef.current) {
          pendingRef.current = false;
          setPending(false);
        }
      }
    });
  }

  const queueRecovery = code === 'jobsUnavailable' ? { kind: 'queue' as const } : null;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`source-upload-${mode}`}>{t(`fields.${mode}`)}</Label>
        {mode === 'url' ? (
          <Input
            id="source-upload-url"
            type="url"
            inputMode="url"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('fields.urlPlaceholder')}
            disabled={pending}
            className="min-h-11"
            aria-invalid={Boolean(localMessage)}
            aria-describedby={localMessage ? 'source-upload-inline-error' : undefined}
          />
        ) : (
          <Textarea
            id="source-upload-text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('fields.textPlaceholder')}
            disabled={pending}
            rows={6}
            maxLength={SOURCE_TEXT_MAX_CHARACTERS}
            className="max-h-64 min-h-32 overflow-y-auto"
            aria-invalid={Boolean(localMessage)}
            aria-describedby={localMessage ? 'source-upload-inline-error' : undefined}
          />
        )}

        {mode === 'text' ? (
          <div className="flex flex-wrap items-center justify-between gap-1">
            <p className="text-text-muted text-small">
              {t('fields.textHint', {
                max: SOURCE_TEXT_MAX_CHARACTERS,
                size: limits.maxFileMb,
              })}
            </p>
            <p className="text-caption text-text-muted tabular-nums" aria-live="polite">
              {t('fields.textCount', {
                count: value.length,
                max: SOURCE_TEXT_MAX_CHARACTERS,
              })}
            </p>
          </div>
        ) : null}

        {localMessage && !localLimit ? (
          <p id="source-upload-inline-error" className="text-danger text-small" role="alert">
            {t(`fields.${localMessage}Error`)}
          </p>
        ) : null}
      </div>

      <UploadErrorNotice
        code={code}
        localError={localLimit}
        limits={limits}
        remaining={remaining}
        recovery={queueRecovery}
      />

      <Button
        type="submit"
        className="min-h-12 w-full"
        disabled={
          pending || !sharedValid || value.trim().length === 0 || code === 'jobsUnavailable'
        }
      >
        {pending ? t('fields.saving') : t('actions.submit')}
      </Button>
    </form>
  );
}
