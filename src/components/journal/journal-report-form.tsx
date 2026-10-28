'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { XPToast } from '@/components/game/xp-toast';
import { reportAction } from '@/lib/journal/actions';
import { isSafeEvidenceUrl } from '@/lib/journal/schemas';
import type { SubmitActionReportResult } from '@/lib/journal/types';
import type { JournalReportView } from './view-types';

const WHAT_MIN = 80;
const WHAT_MAX = 6_000;
const RESULT_MAX = 4_000;
const REFLECTION_MAX = 4_000;
const EVIDENCE_MAX = 2_048;

type FormValues = {
  whatIDid: string;
  result: string;
  reflection: string;
  evidenceUrl: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

type JournalReportFormProps = {
  actionId: string;
  canReport: boolean;
  reports: JournalReportView[];
};

function initialValues(reports: JournalReportView[]): FormValues {
  const last = reports[reports.length - 1];
  if (!last || reports.length !== 1 || (last.qualityScore ?? 0) >= 3) {
    return { whatIDid: '', result: '', reflection: '', evidenceUrl: '' };
  }
  return {
    whatIDid: last.whatIDid,
    result: last.result,
    reflection: last.reflection,
    evidenceUrl: last.evidenceUrl ?? '',
  };
}

/**
 * E7-02: submit or revise one application report. Validation mirrors the
 * backend's strict limits; the AI score is never computed or guessed here. A
 * safe error keeps every input intact, and a low score keeps the form open for
 * the single allowed revision.
 */
export function JournalReportForm({ actionId, canReport, reports }: JournalReportFormProps) {
  const t = useTranslations('journal.form');
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => initialValues(reports));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitActionReportResult | null>(null);

  const lastReport = reports[reports.length - 1];
  const isRevision = reports.length === 1 && (lastReport?.qualityScore ?? 0) < 3;
  const locked = result ? result.verified || !result.canRevise : false;
  const showForm = canReport && !locked;

  if (!canReport && !result) return null;

  function setField(field: keyof FormValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setServerError(null);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const whatIDid = values.whatIDid.trim();
    const actionResult = values.result.trim();
    const reflection = values.reflection.trim();
    const evidenceUrl = values.evidenceUrl.trim();

    if (whatIDid.length < WHAT_MIN) next.whatIDid = t('whatMin');
    else if (whatIDid.length > WHAT_MAX) next.whatIDid = t('whatMax');

    if (actionResult.length === 0) next.result = t('required');
    else if (actionResult.length > RESULT_MAX) next.result = t('resultMax');

    if (reflection.length > REFLECTION_MAX) next.reflection = t('reflectionMax');

    if (evidenceUrl.length > EVIDENCE_MAX) next.evidenceUrl = t('evidenceMax');
    else if (evidenceUrl.length > 0 && !isSafeEvidenceUrl(evidenceUrl)) {
      next.evidenceUrl = t('evidenceInvalid');
    }

    return next;
  }

  function errorForCode(code: string): string {
    switch (code) {
      case 'gradingUnavailable':
        return t('gradingUnavailable');
      case 'revisionLimit':
        return t('revisionLimit');
      case 'alreadyCompleted':
        return t('alreadyCompleted');
      case 'conflict':
        return t('conflict');
      case 'invalidInput':
        return t('invalidInput');
      case 'unexpected':
        return t('unexpected');
      default:
        return t('generic');
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    setServerError(null);
    const evidenceUrl = values.evidenceUrl.trim();
    try {
      const submitted = await reportAction({
        actionId,
        whatIDid: values.whatIDid.trim(),
        result: values.result.trim(),
        reflection: values.reflection.trim() || undefined,
        evidenceUrl: evidenceUrl.length > 0 ? evidenceUrl : undefined,
      });
      if (!submitted.ok) {
        if (
          submitted.code === 'conflict' ||
          submitted.code === 'alreadyCompleted' ||
          submitted.code === 'revisionLimit'
        ) {
          router.refresh();
        }
        setServerError(errorForCode(submitted.code));
        return;
      }
      setResult(submitted);
      router.refresh();
    } catch {
      setServerError(t('generic'));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {result ? (
        <div
          role="status"
          aria-live="polite"
          className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5"
        >
          <h2 className="text-h2">
            {result.verified
              ? t('verifiedTitle')
              : result.canRevise
                ? t('reviseTitle')
                : t('exhaustedTitle')}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {t('scoreLabel', { score: result.qualityScore })}
            </Badge>
            {result.verified ? (
              <Badge className="border-success/30 bg-success/10 text-success">
                {t('verified')}
              </Badge>
            ) : null}
          </div>
          {result.xpAwarded > 0 ? <XPToast amount={result.xpAwarded} /> : null}
          <p className="text-body break-words whitespace-pre-wrap">{result.feedback}</p>
          {result.canRevise ? (
            <p className="text-small text-text-muted">{t('revisionRemaining')}</p>
          ) : null}
          {!result.verified && !result.canRevise ? (
            <p className="text-small text-text-muted">{t('exhaustedBody')}</p>
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="journal-report-form-title" className="text-h2">
              {isRevision ? t('revisionTitle') : t('title')}
            </h2>
            {isRevision ? (
              <p className="text-small text-text-muted">{t('revisionGuidance')}</p>
            ) : null}
          </div>

          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="journal-what">{t('whatLabel')}</Label>
              <p id="journal-what-hint" className="text-small text-text-muted">
                {t('whatHint')}
              </p>
              <Textarea
                id="journal-what"
                name="whatIDid"
                value={values.whatIDid}
                onChange={(event) => setField('whatIDid', event.target.value)}
                aria-invalid={Boolean(errors.whatIDid)}
                aria-describedby="journal-what-hint journal-what-count journal-what-error"
                disabled={pending}
                className="min-h-32"
              />
              <p id="journal-what-count" className="text-caption text-text-muted tabular-nums">
                {t('whatCount', { count: values.whatIDid.trim().length, max: WHAT_MAX })}
              </p>
              {errors.whatIDid ? (
                <p id="journal-what-error" className="text-danger text-small">
                  {errors.whatIDid}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="journal-result">{t('resultLabel')}</Label>
              <p id="journal-result-hint" className="text-small text-text-muted">
                {t('resultHint')}
              </p>
              <Textarea
                id="journal-result"
                name="result"
                value={values.result}
                onChange={(event) => setField('result', event.target.value)}
                aria-invalid={Boolean(errors.result)}
                aria-describedby="journal-result-hint journal-result-error"
                disabled={pending}
              />
              {errors.result ? (
                <p id="journal-result-error" className="text-danger text-small">
                  {errors.result}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="journal-reflection">{t('reflectionLabel')}</Label>
              <p id="journal-reflection-hint" className="text-small text-text-muted">
                {t('reflectionHint')}
              </p>
              <Textarea
                id="journal-reflection"
                name="reflection"
                value={values.reflection}
                onChange={(event) => setField('reflection', event.target.value)}
                aria-invalid={Boolean(errors.reflection)}
                aria-describedby="journal-reflection-hint journal-reflection-error"
                disabled={pending}
              />
              {errors.reflection ? (
                <p id="journal-reflection-error" className="text-danger text-small">
                  {errors.reflection}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="journal-evidence">{t('evidenceLabel')}</Label>
              <p id="journal-evidence-hint" className="text-small text-text-muted">
                {t('evidenceHint')}
              </p>
              <Input
                id="journal-evidence"
                name="evidenceUrl"
                type="url"
                inputMode="url"
                value={values.evidenceUrl}
                onChange={(event) => setField('evidenceUrl', event.target.value)}
                aria-invalid={Boolean(errors.evidenceUrl)}
                aria-describedby="journal-evidence-hint journal-evidence-error"
                disabled={pending}
              />
              {errors.evidenceUrl ? (
                <p id="journal-evidence-error" className="text-danger text-small">
                  {errors.evidenceUrl}
                </p>
              ) : null}
            </div>

            {serverError ? (
              <p role="alert" className="text-danger text-small">
                {serverError}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? t('pending') : isRevision ? t('submitRevision') : t('submit')}
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
