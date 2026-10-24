import { getTranslations } from 'next-intl/server';
import { Lightbulb, Hammer, BadgeCheck } from 'lucide-react';

/** E0-01 AC2 — the three pillars from PRD §1, rewritten for visitors. */
export async function CaraKerja() {
  const t = await getTranslations('landing');

  const pillars = [
    { key: 'pahami', icon: <Lightbulb className="text-primary size-5" aria-hidden="true" /> },
    { key: 'terapkan', icon: <Hammer className="text-primary size-5" aria-hidden="true" /> },
    { key: 'buktikan', icon: <BadgeCheck className="text-primary size-5" aria-hidden="true" /> },
  ] as const;

  return (
    <section aria-labelledby="cara-kerja-title" className="bg-surface-2/50 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <h2 id="cara-kerja-title" className="text-h2">
          {t('howItWorks.title')}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-xl">{t('howItWorks.subtitle')}</p>
        <div className="mt-6 grid gap-4 sm:mt-8 md:grid-cols-3">
          {pillars.map(({ key, icon }) => (
            <div
              key={key}
              className="bg-surface border-border rounded-[var(--radius-card)] border p-5"
            >
              {icon}
              <h3 className="text-h3 mt-3">{t(`howItWorks.${key}.title`)}</h3>
              <p className="text-muted-foreground mt-2">{t(`howItWorks.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
