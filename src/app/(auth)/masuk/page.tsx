import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCurrentUser } from '@/lib/auth/session';
import { emailSignInAction, googleSignInAction } from '@/lib/auth/actions';
import { safeCallbackUrl } from '@/lib/auth/validation';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

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
    <section className="space-y-6">
      <div className="space-y-2">
        <Link href="/" className="mb-4 inline-flex min-h-11 items-center">
          <BrandLogo className="w-44" sizes="176px" />
        </Link>
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      {params.error && (
        <p role="alert" className="text-danger text-small">
          {t(`errors.${errorKey}`)}
        </p>
      )}
      <form action={googleSignInAction}>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Button type="submit" variant="outline" className="min-h-11 w-full">
          {t('google')}
        </Button>
      </form>
      <div className="flex items-center gap-3">
        <div className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-small">{t('divider')}</span>
        <div className="bg-border h-px flex-1" />
      </div>
      <form action={emailSignInAction} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="space-y-2">
          <Label htmlFor="email">{t('emailLabel')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            placeholder={t('emailPlaceholder')}
            className="min-h-11"
          />
        </div>
        <p className="text-muted-foreground text-small">{t('emailHint')}</p>
        <Button type="submit" className="min-h-11 w-full">
          {t('sendLink')}
        </Button>
      </form>
    </section>
  );
}
