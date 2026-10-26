import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function CheckEmailPage() {
  const t = await getTranslations('auth');
  return (
    <section className="space-y-6 text-center" aria-labelledby="check-email-heading">
      <div className="space-y-2">
        <h1 id="check-email-heading" className="text-h1 tracking-tight text-balance">
          {t('checkEmailTitle')}
        </h1>
        <p className="text-muted-foreground text-small leading-relaxed font-normal text-pretty">
          {t('checkEmailDescription')}
        </p>
      </div>
      <p className="text-muted-foreground text-small leading-relaxed font-normal text-pretty">
        {t('checkSpam')}
      </p>
      <Link
        href="/masuk"
        className="text-primary text-small inline-flex min-h-11 items-center underline underline-offset-4"
      >
        {t('back')}
      </Link>
    </section>
  );
}
