import { getTranslations } from 'next-intl/server';

export type LegalPageKind = 'syarat' | 'privasi' | 'hakCipta';

/**
 * Legal placeholder page (E15-05): H1 plus a clearly visible notice that the
 * final legal text is pending review by a legal consultant.
 */
export async function LegalPageContent({ kind }: { kind: LegalPageKind }) {
  const t = await getTranslations('legal');

  return (
    <article className="mx-auto w-full max-w-[640px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <h1 className="text-h1">{t(`${kind}.title`)}</h1>
      <div
        role="note"
        className="border-primary/30 bg-primary-soft mt-6 rounded-[var(--radius-card)] border p-4"
      >
        <p className="font-semibold">{t('notice.title')}</p>
        <p className="mt-1">{t('notice.body')}</p>
      </div>
      <p className="mt-8">{t(`${kind}.intro`)}</p>
      <p className="mt-4">{t(`${kind}.p1`)}</p>
      <p className="mt-4">{t(`${kind}.p2`)}</p>
      <p className="mt-4">{t(`${kind}.p3`)}</p>
    </article>
  );
}
