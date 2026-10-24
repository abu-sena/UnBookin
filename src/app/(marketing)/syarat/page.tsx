import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPageContent } from '@/components/marketing/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal');
  return { title: t('syarat.title'), description: t('syarat.intro') };
}

export default function SyaratPage() {
  return <LegalPageContent kind="syarat" />;
}
