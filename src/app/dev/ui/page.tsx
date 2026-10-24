import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BottomNav } from '@/components/layout/bottom-nav';
import { TopBar } from '@/components/layout/top-bar';
import { DevUiShowcase } from './showcase';

export default async function DevUiPage() {
  // Dev-only showcase; hidden in production unless explicitly enabled.
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ENABLE_DEV_UI !== 'true') {
    notFound();
  }

  const tDevUi = await getTranslations('devUi');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16">
      <DevUiShowcase
        title={tDevUi('title')}
        description={tDevUi('description')}
        topBarSlot={<TopBar title={tDevUi('sectionNavigation')} />}
        bottomNavSlot={<BottomNav reviewCount={14} />}
      />
    </div>
  );
}
