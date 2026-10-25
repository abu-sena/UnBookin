'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeftIcon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { track } from '@/lib/analytics/events';
import { saveOnboarding } from '@/lib/profile/actions';
import {
  DAILY_GOAL_MINUTES,
  displayNameFieldSchema,
  goalFieldSchema,
  jobRoleFieldSchema,
  MAX_ADDITIONAL_INTERESTS,
  type LearningProfileField,
  type ProfileActionState,
  type SelectableInterest,
} from '@/lib/profile/schema';
import { cn } from '@/lib/utils';
import './analytics';

const STEP_KEYS = ['name', 'role', 'interests', 'goal', 'dailyGoal'] as const;
const STEP_COUNT = STEP_KEYS.length;

const ROLE_SUGGESTION_KEYS = [
  'manager',
  'divisionHead',
  'businessOwner',
  'hr',
  'consultant',
  'marketer',
  'postgrad',
  'educator',
] as const;

const STEP_FOR_FIELD: Record<LearningProfileField, number> = {
  displayName: 0,
  jobRole: 1,
  primaryInterestSlug: 2,
  additionalInterestSlugs: 2,
  goal: 3,
  dailyGoalMinutes: 4,
  timezone: 4,
  experienceLevel: 4,
};

type OnboardingWizardProps = {
  initialName: string;
  interests: SelectableInterest[];
};

function firstErrorStep(
  fieldErrors: Partial<Record<LearningProfileField, string>> | undefined,
): number | null {
  if (!fieldErrors) return null;
  const steps = Object.keys(fieldErrors)
    .map((field) => STEP_FOR_FIELD[field as LearningProfileField])
    .filter((step): step is number => typeof step === 'number');
  return steps.length > 0 ? Math.min(...steps) : null;
}

export function OnboardingWizard({ initialName, interests }: OnboardingWizardProps) {
  const router = useRouter();
  const t = useTranslations('onboarding');
  const tProfile = useTranslations('profileForm');

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(initialName);
  const [jobRole, setJobRole] = useState('');
  const [primaryInterestSlug, setPrimaryInterestSlug] = useState<string | null>(null);
  const [additionalInterestSlugs, setAdditionalInterestSlugs] = useState<string[]>([]);
  const [goal, setGoal] = useState('');
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(10);
  const [state, setState] = useState<ProfileActionState>({ status: 'idle' });
  const [finished, setFinished] = useState(false);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const stepValid = [
    displayNameFieldSchema.safeParse(displayName).success,
    jobRoleFieldSchema.safeParse(jobRole).success,
    Boolean(primaryInterestSlug) &&
      additionalInterestSlugs.length <= MAX_ADDITIONAL_INTERESTS &&
      !additionalInterestSlugs.includes(primaryInterestSlug ?? ''),
    goalFieldSchema.safeParse(goal).success,
    (DAILY_GOAL_MINUTES as readonly number[]).includes(dailyGoalMinutes),
  ][step];

  const fieldErrors = state.status === 'error' ? state.fieldErrors : undefined;
  const fieldError = (field: LearningProfileField) => {
    const key = fieldErrors?.[field] as LearningProfileField | undefined;
    return key ? tProfile(`errors.${key}`) : undefined;
  };

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(() => router.replace('/home'), 1200);
    return () => window.clearTimeout(timer);
  }, [finished, router]);

  function choosePrimary(slug: string) {
    setPrimaryInterestSlug(slug);
    setAdditionalInterestSlugs((current) => current.filter((value) => value !== slug));
    setState({ status: 'idle' });
  }

  function toggleAdditional(slug: string) {
    if (slug === primaryInterestSlug) return;
    setAdditionalInterestSlugs((current) => {
      if (current.includes(slug)) return current.filter((value) => value !== slug);
      if (current.length >= MAX_ADDITIONAL_INTERESTS) return current;
      return [...current, slug];
    });
    setState({ status: 'idle' });
  }

  function submitAll() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const formData = new FormData();
    formData.set('displayName', displayName);
    formData.set('jobRole', jobRole);
    formData.set('primaryInterestSlug', primaryInterestSlug ?? '');
    additionalInterestSlugs.forEach((slug) => formData.append('additionalInterestSlugs', slug));
    formData.set('goal', goal);
    formData.set('dailyGoalMinutes', String(dailyGoalMinutes));
    if (timezone) formData.set('timezone', timezone);

    startTransition(async () => {
      const result = await saveOnboarding({ status: 'idle' }, formData);
      if (result.status === 'success') {
        track('onboarding_completed', {
          daily_goal_minutes: dailyGoalMinutes,
          interest_count: 1 + additionalInterestSlugs.length,
        });
        setFinished(true);
        return;
      }
      setState(result);
      const nextStep = firstErrorStep(result.status === 'error' ? result.fieldErrors : undefined);
      if (nextStep !== null) setStep(nextStep);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || finished || !stepValid) return;
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
      setState({ status: 'idle' });
      return;
    }
    submitAll();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter') return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  if (finished) {
    return <FinishMoment title={t('finishTitle')} description={t('finishDescription')} />;
  }

  const stepKey = STEP_KEYS[step]!;
  const progressLabel = t('progress', { current: step + 1, total: STEP_COUNT });

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      noValidate
      className="flex min-h-[calc(100dvh-3rem)] flex-col"
    >
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('back')}
            onClick={() => {
              setStep((current) => Math.max(0, current - 1));
              setState({ status: 'idle' });
            }}
            disabled={step === 0}
            className="min-h-11 min-w-11"
          >
            <ArrowLeftIcon aria-hidden="true" />
          </Button>
          <p className="text-small text-muted-foreground">{progressLabel}</p>
          <span className="size-11" aria-hidden="true" />
        </div>
        <Progress value={((step + 1) / STEP_COUNT) * 100} aria-label={progressLabel} />
      </header>

      <div
        key={step}
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 flex-1 pt-8 motion-safe:duration-200"
      >
        <h1 ref={headingRef} tabIndex={-1} className="text-h1 outline-none">
          {t(`steps.${stepKey}.title`)}
        </h1>
        <p className="text-muted-foreground mt-2">{t(`steps.${stepKey}.description`)}</p>

        <div className="mt-6 space-y-4">
          {step === 0 && (
            <div className="space-y-2">
              <Label htmlFor="displayName">{tProfile('labels.displayName')}</Label>
              <Input
                id="displayName"
                name="displayName"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setState({ status: 'idle' });
                }}
                autoComplete="nickname"
                maxLength={40}
                placeholder={tProfile('placeholders.displayName')}
                className="min-h-11"
                aria-invalid={Boolean(fieldError('displayName'))}
              />
              {fieldError('displayName') && (
                <p className="text-danger text-small">{fieldError('displayName')}</p>
              )}
            </div>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="jobRole">{tProfile('labels.jobRole')}</Label>
                <Input
                  id="jobRole"
                  name="jobRole"
                  value={jobRole}
                  onChange={(event) => {
                    setJobRole(event.target.value);
                    setState({ status: 'idle' });
                  }}
                  autoComplete="organization-title"
                  maxLength={80}
                  placeholder={tProfile('placeholders.jobRole')}
                  className="min-h-11"
                  aria-invalid={Boolean(fieldError('jobRole'))}
                />
                {fieldError('jobRole') && (
                  <p className="text-danger text-small">{fieldError('jobRole')}</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-small font-medium">{t('roleSuggestionsLabel')}</p>
                <div className="flex flex-wrap gap-2">
                  {ROLE_SUGGESTION_KEYS.map((key) => {
                    const suggestion = tProfile(`roleSuggestions.${key}`);
                    return (
                      <Button
                        key={key}
                        type="button"
                        variant={jobRole === suggestion ? 'secondary' : 'outline'}
                        size="sm"
                        className="min-h-11 rounded-full"
                        aria-pressed={jobRole === suggestion}
                        onClick={() => {
                          setJobRole(suggestion);
                          setState({ status: 'idle' });
                        }}
                      >
                        {suggestion}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <fieldset className="space-y-2">
                <legend className="text-small font-medium">{t('primaryInterestLabel')}</legend>
                <div className="grid gap-2">
                  {interests.map((interest) => {
                    const selected = primaryInterestSlug === interest.slug;
                    return (
                      <button
                        key={interest.slug}
                        type="button"
                        aria-pressed={selected}
                        aria-label={t('primaryAria', { name: interest.name })}
                        onClick={() => choosePrimary(interest.slug)}
                        className={cn(
                          'duration-base ease-out-soft min-h-11 rounded-[var(--radius-card)] border p-3 text-left transition-colors',
                          selected
                            ? 'border-primary bg-primary-soft'
                            : 'border-border bg-surface hover:bg-surface-2',
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-body font-medium">{interest.name}</span>
                          {selected && (
                            <span className="text-caption text-primary">{t('primaryBadge')}</span>
                          )}
                        </span>
                        {interest.description && (
                          <span className="text-small text-muted-foreground mt-1 block">
                            {interest.description}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {fieldError('primaryInterestSlug') && (
                  <p className="text-danger text-small">{fieldError('primaryInterestSlug')}</p>
                )}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-small font-medium">{t('additionalInterestsLabel')}</legend>
                <p className="text-small text-muted-foreground">
                  {additionalInterestSlugs.length >= MAX_ADDITIONAL_INTERESTS
                    ? t('additionalInterestsFull')
                    : t('additionalInterestsHint')}
                </p>
                <div className="grid gap-2">
                  {interests
                    .filter((interest) => interest.slug !== primaryInterestSlug)
                    .map((interest) => {
                      const selected = additionalInterestSlugs.includes(interest.slug);
                      const disabled =
                        !selected && additionalInterestSlugs.length >= MAX_ADDITIONAL_INTERESTS;
                      return (
                        <button
                          key={interest.slug}
                          type="button"
                          disabled={disabled}
                          aria-pressed={selected}
                          aria-label={t('additionalAria', { name: interest.name })}
                          onClick={() => toggleAdditional(interest.slug)}
                          className={cn(
                            'duration-base ease-out-soft min-h-11 rounded-[var(--radius-card)] border p-3 text-left transition-colors',
                            selected
                              ? 'border-primary bg-primary-soft'
                              : 'border-border bg-surface hover:bg-surface-2',
                            disabled && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-body font-medium">{interest.name}</span>
                            {selected && (
                              <span className="text-caption text-primary">{t('selected')}</span>
                            )}
                          </span>
                          {interest.description && (
                            <span className="text-small text-muted-foreground mt-1 block">
                              {interest.description}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
                {fieldError('additionalInterestSlugs') && (
                  <p className="text-danger text-small">{fieldError('additionalInterestSlugs')}</p>
                )}
              </fieldset>
            </>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <Label htmlFor="goal">{tProfile('labels.goal')}</Label>
              <Textarea
                id="goal"
                name="goal"
                value={goal}
                onChange={(event) => {
                  setGoal(event.target.value);
                  setState({ status: 'idle' });
                }}
                maxLength={200}
                rows={4}
                placeholder={tProfile('placeholders.goal')}
                className="min-h-28"
                aria-invalid={Boolean(fieldError('goal'))}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-small text-muted-foreground">{t('goalHint')}</p>
                <p className="text-caption text-muted-foreground tabular-nums" aria-live="polite">
                  {t('charCount', { count: goal.length, max: 200 })}
                </p>
              </div>
              {fieldError('goal') && <p className="text-danger text-small">{fieldError('goal')}</p>}
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-3">
              {DAILY_GOAL_MINUTES.map((minutes) => {
                const selected = dailyGoalMinutes === minutes;
                return (
                  <button
                    key={minutes}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setDailyGoalMinutes(minutes);
                      setState({ status: 'idle' });
                    }}
                    className={cn(
                      'duration-base ease-out-soft min-h-14 rounded-[var(--radius-card)] border px-4 py-3 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary-soft'
                        : 'border-border bg-surface hover:bg-surface-2',
                    )}
                  >
                    <span className="text-h2">
                      {tProfile('labels.minutes', { count: minutes })}
                    </span>
                  </button>
                );
              })}
              {fieldError('dailyGoalMinutes') && (
                <p className="text-danger text-small">{fieldError('dailyGoalMinutes')}</p>
              )}
            </div>
          )}
        </div>

        {state.status === 'error' && (
          <p role="alert" className="text-danger text-small mt-4">
            {tProfile(`errors.${state.messageKey}`)}
          </p>
        )}
      </div>

      <div className="bg-background sticky bottom-0 mt-auto pt-8 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button type="submit" className="min-h-12 w-full" disabled={!stepValid || pending}>
          {pending ? t('saving') : step === STEP_COUNT - 1 ? t('submit') : t('next')}
        </Button>
      </div>
    </form>
  );
}

function FinishMoment({ title, description }: { title: string; description: string }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div
        className={cn(
          'bg-primary-soft text-primary flex size-20 items-center justify-center rounded-full transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none',
          shown ? 'scale-100' : 'scale-50',
        )}
      >
        <CheckIcon className="size-10" aria-hidden="true" />
      </div>
      <h1 className="text-h1">{title}</h1>
      <p className="text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}
