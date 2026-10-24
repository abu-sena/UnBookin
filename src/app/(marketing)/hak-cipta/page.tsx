import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalPageContent } from '@/components/marketing/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal');
  return { title: t('hakCipta.title'), description: t('hakCipta.intro') };
}

export default function HakCiptaPage() {
  return <LegalPageContent kind="hakCipta" />;
}
