import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPageContent } from '@/components/marketing/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal');
  return { title: t('privasi.title'), description: t('privasi.intro') };
}

export default function PrivasiPage() {
  return <LegalPageContent kind="privasi" />;
}
