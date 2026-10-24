import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function CheckEmailPage() {
  const t = await getTranslations('auth');
  return (
    <section className="space-y-4">
      <h1 className="text-h1">{t('checkEmailTitle')}</h1>
      <p className="text-muted-foreground">{t('checkEmailDescription')}</p>
      <p className="text-muted-foreground text-small">{t('checkSpam')}</p>
      <Link
        href="/masuk"
        className="text-primary inline-flex min-h-11 items-center underline underline-offset-4"
      >
        {t('back')}
      </Link>
    </section>
  );
}
