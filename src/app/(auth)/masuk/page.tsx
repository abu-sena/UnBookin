import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCurrentUser } from '@/lib/auth/session';
import { emailSignInAction, googleSignInAction } from '@/lib/auth/actions';
import { safeCallbackUrl } from '@/lib/auth/validation';

type SignInSearchParams = Promise<{ callbackUrl?: string; error?: string }>;

// The session read is request-time data, so it streams inside Suspense (Cache Components).
export default function SignInPage({ searchParams }: { searchParams: SignInSearchParams }) {
  return (
    <Suspense
      fallback={
        <div className="bg-surface-2 h-96 w-full animate-pulse rounded-[var(--radius-card)] motion-reduce:animate-none" />
      }
    >
      <SignInContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignInContent({ searchParams }: { searchParams: SignInSearchParams }) {
  if (await getCurrentUser()) redirect('/home');
  const [params, t] = await Promise.all([searchParams, getTranslations('auth')]);
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const errorKey =
    params.error === 'InvalidEmail'
      ? 'invalidEmail'
      : params.error === 'OAuthAccountNotLinked'
        ? 'accountNotLinked'
        : params.error === 'AccessDenied'
          ? 'accessDenied'
          : params.error === 'Verification'
            ? 'verification'
            : params.error === 'RateLimited'
              ? 'rateLimited'
              : 'generic';

  return (
    <section className="space-y-6" aria-labelledby="sign-in-heading">
      <header className="space-y-2 text-center">
        <h1 id="sign-in-heading" className="text-h1 tracking-tight text-balance">
          {t('title')}
        </h1>
        <p className="text-muted-foreground text-small mx-auto max-w-[32ch] leading-relaxed font-normal text-pretty">
          {t('description')}
        </p>
      </header>
      {params.error && (
        <p
          role="alert"
          className="text-danger bg-danger/10 text-small rounded-[var(--radius-input)] p-3 leading-relaxed text-pretty"
        >
          {t(`errors.${errorKey}`)}
        </p>
      )}
      <form action={googleSignInAction}>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Button type="submit" variant="outline" className="min-h-12 w-full whitespace-normal">
          {t('google')}
        </Button>
      </form>
      <div className="flex items-center gap-3">
        <div className="bg-border h-px flex-1" aria-hidden="true" />
        <span className="text-muted-foreground text-caption">{t('divider')}</span>
        <div className="bg-border h-px flex-1" aria-hidden="true" />
      </div>
      <form action={emailSignInAction} className="space-y-5">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="space-y-2">
          <Label htmlFor="email">{t('emailLabel')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-describedby="email-hint"
            required
            maxLength={254}
            placeholder={t('emailPlaceholder')}
            className="min-h-12 rounded-[var(--radius-input)] md:text-base"
          />
          <p
            id="email-hint"
            className="text-muted-foreground text-small leading-relaxed font-normal text-pretty"
          >
            {t('emailHint')}
          </p>
        </div>
        <Button type="submit" className="min-h-12 w-full whitespace-normal">
          {t('sendLink')}
        </Button>
      </form>
    </section>
  );
}
