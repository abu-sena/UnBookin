'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateLearningProfile } from '@/lib/profile/actions';
import {
  DAILY_GOAL_MINUTES,
  EXPERIENCE_LEVELS,
  MAX_ADDITIONAL_INTERESTS,
  type LearningProfile,
  type LearningProfileField,
  type ProfileActionState,
  type SelectableInterest,
} from '@/lib/profile/schema';
import { cn } from '@/lib/utils';

const initialState: ProfileActionState = { status: 'idle' };

const roleSuggestionKeys = [
  'manager',
  'divisionHead',
  'businessOwner',
  'hr',
  'consultant',
  'marketer',
  'postgrad',
  'educator',
] as const;

const errorKeys = [
  'invalidInput',
  'invalidInterest',
  'generic',
  'displayName',
  'jobRole',
  'primaryInterestSlug',
  'additionalInterestSlugs',
  'goal',
  'dailyGoalMinutes',
  'timezone',
  'experienceLevel',
] as const;

type ErrorKey = (typeof errorKeys)[number];

function isErrorKey(value: string): value is ErrorKey {
  return (errorKeys as readonly string[]).includes(value);
}

type FormValues = {
  displayName: string;
  jobRole: string;
  primaryInterestSlug: string;
  additionalInterestSlugs: string[];
  goal: string;
  dailyGoalMinutes: number;
  experienceLevel: NonNullable<LearningProfile['experienceLevel']>;
  timezone: string;
};

export type LearningProfileFormProps = {
  profile: LearningProfile | null;
  interests: SelectableInterest[];
};

/** E1-02 AC3: edit the onboarding answers from Settings. */
export function LearningProfileForm({ profile, interests }: LearningProfileFormProps) {
  const t = useTranslations('profileForm');
  const tSettings = useTranslations('settings');
  const [state, action, pending] = useActionState(updateLearningProfile, initialState);
  // Controlled so typed values survive a failed submit (the action is dispatched manually).
  const [values, setValues] = useState<FormValues>(() => ({
    displayName: profile?.displayName ?? '',
    jobRole: profile?.jobRole ?? '',
    primaryInterestSlug: profile?.primaryInterestSlug ?? '',
    additionalInterestSlugs: profile?.additionalInterestSlugs ?? [],
    goal: profile?.goal ?? '',
    dailyGoalMinutes: profile?.dailyGoalMinutes ?? 10,
    experienceLevel: profile?.experienceLevel ?? 'novice',
    timezone: profile?.timezone ?? 'Asia/Jakarta',
  }));

  useEffect(() => {
    if (state.status === 'success') toast.success(t('saved'));
  }, [state, t]);

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function selectPrimaryInterest(slug: string) {
    setValues((current) => ({
      ...current,
      primaryInterestSlug: slug,
      additionalInterestSlugs: current.additionalInterestSlugs.filter((item) => item !== slug),
    }));
  }

  function toggleAdditionalInterest(slug: string) {
    setValues((current) => {
      if (current.additionalInterestSlugs.includes(slug)) {
        return {
          ...current,
          additionalInterestSlugs: current.additionalInterestSlugs.filter((item) => item !== slug),
        };
      }
      if (current.additionalInterestSlugs.length >= MAX_ADDITIONAL_INTERESTS) return current;
      return {
        ...current,
        additionalInterestSlugs: [...current.additionalInterestSlugs, slug],
      };
    });
  }

  function fieldError(field: LearningProfileField): string | undefined {
    if (state.status !== 'error') return undefined;
    const key = state.fieldErrors?.[field];
    if (!key || !isErrorKey(key)) return undefined;
    return t(`errors.${key}`);
  }

  const additionalOptions = interests.filter(
    (interest) => interest.slug !== values.primaryInterestSlug,
  );

  return (
    <form
      aria-busy={pending}
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        // Dispatch manually instead of `action={…}` so React does not reset the form after an error.
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
    >
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">{t('labels.displayName')}</Label>
          <Input
            id="displayName"
            name="displayName"
            value={values.displayName}
            onChange={(event) => setField('displayName', event.target.value)}
            placeholder={t('placeholders.displayName')}
            maxLength={40}
            autoComplete="nickname"
            className="min-h-11"
            aria-invalid={fieldError('displayName') ? true : undefined}
            aria-describedby={fieldError('displayName') ? 'displayName-error' : undefined}
          />
          <FieldError id="displayName-error" message={fieldError('displayName')} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="jobRole">{t('labels.jobRole')}</Label>
          <Input
            id="jobRole"
            name="jobRole"
            value={values.jobRole}
            onChange={(event) => setField('jobRole', event.target.value)}
            placeholder={t('placeholders.jobRole')}
            maxLength={80}
            className="min-h-11"
            aria-invalid={fieldError('jobRole') ? true : undefined}
            aria-describedby={fieldError('jobRole') ? 'jobRole-error' : undefined}
          />
          <FieldError id="jobRole-error" message={fieldError('jobRole')} />
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={tSettings('roleSuggestionsLabel')}
          >
            {roleSuggestionKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setField('jobRole', t(`roleSuggestions.${key}`))}
                className="border-border bg-surface text-small duration-fast ease-out-soft hover:bg-surface-2 min-h-9 rounded-[var(--radius-full)] border px-3 transition-colors"
              >
                {t(`roleSuggestions.${key}`)}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-small font-medium">{t('labels.primaryInterest')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {interests.map((interest) => (
              <label
                key={interest.slug}
                className="border-border bg-surface has-checked:border-primary has-checked:bg-primary-soft flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-input)] border px-3 py-2"
              >
                <input
                  type="radio"
                  name="primaryInterestSlug"
                  value={interest.slug}
                  checked={values.primaryInterestSlug === interest.slug}
                  onChange={() => selectPrimaryInterest(interest.slug)}
                  className="accent-primary size-4 shrink-0"
                />
                <span className="text-small">{interest.name}</span>
              </label>
            ))}
          </div>
          <FieldError id="primaryInterestSlug-error" message={fieldError('primaryInterestSlug')} />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-small font-medium">{t('labels.additionalInterests')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {additionalOptions.map((interest) => {
              const checked = values.additionalInterestSlugs.includes(interest.slug);
              const limitReached =
                !checked && values.additionalInterestSlugs.length >= MAX_ADDITIONAL_INTERESTS;
              return (
                <label
                  key={interest.slug}
                  className={cn(
                    'border-border bg-surface has-checked:border-primary has-checked:bg-primary-soft flex min-h-11 items-center gap-3 rounded-[var(--radius-input)] border px-3 py-2',
                    limitReached ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="checkbox"
                    name="additionalInterestSlugs"
                    value={interest.slug}
                    checked={checked}
                    disabled={limitReached}
                    onChange={() => toggleAdditionalInterest(interest.slug)}
                    className="accent-primary size-4 shrink-0"
                  />
                  <span className="text-small">{interest.name}</span>
                </label>
              );
            })}
          </div>
          <FieldError
            id="additionalInterestSlugs-error"
            message={fieldError('additionalInterestSlugs')}
          />
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="goal">{t('labels.goal')}</Label>
          <Textarea
            id="goal"
            name="goal"
            value={values.goal}
            onChange={(event) => setField('goal', event.target.value)}
            placeholder={t('placeholders.goal')}
            maxLength={200}
            rows={3}
            className="min-h-24"
            aria-invalid={fieldError('goal') ? true : undefined}
            aria-describedby={fieldError('goal') ? 'goal-error' : undefined}
          />
          <FieldError id="goal-error" message={fieldError('goal')} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-small font-medium">{t('labels.dailyGoal')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {DAILY_GOAL_MINUTES.map((minutes) => (
              <label
                key={minutes}
                className="border-border bg-surface has-checked:border-primary has-checked:bg-primary-soft flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-input)] border px-3 py-2"
              >
                <input
                  type="radio"
                  name="dailyGoalMinutes"
                  value={minutes}
                  checked={values.dailyGoalMinutes === minutes}
                  onChange={() => setField('dailyGoalMinutes', minutes)}
                  className="accent-primary size-4 shrink-0"
                />
                <span className="text-small tabular-nums">
                  {t('labels.minutes', { count: minutes })}
                </span>
              </label>
            ))}
          </div>
          <FieldError id="dailyGoalMinutes-error" message={fieldError('dailyGoalMinutes')} />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-small font-medium">{t('labels.experienceLevel')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {EXPERIENCE_LEVELS.map((level) => (
              <label
                key={level}
                className="border-border bg-surface has-checked:border-primary has-checked:bg-primary-soft flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-input)] border px-3 py-2"
              >
                <input
                  type="radio"
                  name="experienceLevel"
                  value={level}
                  checked={values.experienceLevel === level}
                  onChange={() => setField('experienceLevel', level)}
                  className="accent-primary size-4 shrink-0"
                />
                <span className="text-small">{t(`experienceLevels.${level}`)}</span>
              </label>
            ))}
          </div>
          <FieldError id="experienceLevel-error" message={fieldError('experienceLevel')} />
        </fieldset>

        <input type="hidden" name="timezone" value={values.timezone} />
      </fieldset>

      {state.status === 'error' ? (
        <p role="alert" className="text-danger text-small">
          {t(`errors.${state.messageKey}`)}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-danger text-caption">
      {message}
    </p>
  );
}
