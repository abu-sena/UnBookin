'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getWaitlistPriceVariant, joinWaitlist } from '@/lib/waitlist/actions';
import { trackWaitlistJoined } from '@/lib/waitlist/analytics';
import type { WaitlistState } from '@/lib/waitlist/schema';

const initialState: WaitlistState = { status: 'idle' };
const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => '';

export type WaitlistInterest = { slug: string; name: string };

export type WaitlistFormProps = {
  /** The three opening interests (E0-02 AC1), loaded by the page from `interests`. */
  interests: WaitlistInterest[];
  /** Referral code from the `?ref=` query param, if any. */
  referralCode?: string;
};

export function WaitlistForm({ interests, referralCode }: WaitlistFormProps) {
  const t = useTranslations('waitlist');
  const [state, action, pending] = useActionState(joinWaitlist, initialState);
  // Controlled so the visitor's input survives re-renders when an error shows.
  const [email, setEmail] = useState('');
  const [interestSlug, setInterestSlug] = useState('');
  const submittedInterest = useRef('');
  const trackedCode = useRef<string | null>(null);
  const origin = useSyncExternalStore(subscribe, getOrigin, getServerOrigin);
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '');

  useEffect(() => {
    if (state.status !== 'success' || trackedCode.current === state.referralCode) return;
    trackedCode.current = state.referralCode;
    const interest = submittedInterest.current;
    void getWaitlistPriceVariant()
      .then((variant) => {
        trackWaitlistJoined(interest, variant);
      })
      .catch(() => {
        /* Analytics must not interrupt successful signup. */
      });
  }, [state]);

  const inputClass =
    'min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  const buttonClass =
    'inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60';

  if (state.status === 'success') {
    const link = `${baseUrl}/?ref=${encodeURIComponent(state.referralCode)}`;
    return (
      <section
        aria-live="polite"
        className="border-border bg-surface space-y-4 rounded-2xl border p-5"
      >
        <h3 className="text-text text-xl font-semibold">
          {t('success', { position: state.position })}
        </h3>
        <label className="block space-y-2">
          <span>{t('shareLabel')}</span>
          <input
            readOnly
            value={link}
            className={inputClass}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={buttonClass}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast.success(t('copied'));
              } catch {
                toast.error(t('copyFailed'));
              }
            }}
          >
            {t('copy')}
          </button>
          <a
            className="border-border text-primary focus-visible:outline-primary inline-flex min-h-11 items-center rounded-xl border px-4 py-3 underline-offset-4 hover:underline focus-visible:outline-2"
            href={`https://wa.me/?text=${encodeURIComponent(t('shareText', { link }))}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('whatsapp')}
          </a>
        </div>
        <p className="text-text-muted text-sm">{t('boost')}</p>
      </section>
    );
  }

  return (
    <form
      className="space-y-4"
      aria-busy={pending}
      onSubmit={(event) => {
        // Dispatch manually instead of `action={…}` so React does not reset the form after an error.
        event.preventDefault();
        const form = event.currentTarget;
        submittedInterest.current = new FormData(form).get('interestSlug')?.toString() ?? '';
        const query = new URLSearchParams(window.location.search);
        const utm = new URLSearchParams();
        query.forEach((value, key) => {
          if (key.startsWith('utm_')) utm.append(key, value);
        });
        const utmField = form.elements.namedItem('utm');
        const refField = form.elements.namedItem('ref');
        if (utmField instanceof HTMLInputElement) utmField.value = utm.toString().slice(0, 300);
        if (refField instanceof HTMLInputElement)
          refField.value = referralCode ?? query.get('ref') ?? '';
        const formData = new FormData(form);
        startTransition(() => action(formData));
      }}
    >
      <label className="block space-y-2">
        <span className="font-medium">{t('emailLabel')}</span>
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('emailPlaceholder')}
          className={inputClass}
          aria-describedby={state.status === 'error' ? 'waitlist-error' : undefined}
        />
      </label>
      <fieldset disabled={pending} className="space-y-3">
        <legend className="font-medium">{t('interestLegend')}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {interests.map((interest) => (
            <label
              key={interest.slug}
              className="border-border bg-surface has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-primary flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
            >
              <input
                type="radio"
                name="interestSlug"
                value={interest.slug}
                checked={interestSlug === interest.slug}
                onChange={() => setInterestSlug(interest.slug)}
                required
                className="accent-primary size-4 shrink-0"
              />
              <span>{interest.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <input type="hidden" name="ref" defaultValue={referralCode ?? ''} />
      <input type="hidden" name="utm" defaultValue="" />
      <div className="sr-only" aria-hidden="true">
        <label>
          {t('website')}
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.status === 'error' && (
        <p id="waitlist-error" role="alert" className="text-danger text-sm">
          {t(`errors.${state.messageKey}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {t(pending ? 'pending' : 'submit')}
      </button>
    </form>
  );
}
