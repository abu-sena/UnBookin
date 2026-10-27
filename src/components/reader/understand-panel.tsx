'use client';

import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import { ConceptMapLazy } from '@/components/module/concept-map-lazy';
import { LayerToggle, type LayerValue } from '@/components/module/layer-toggle';
import type { ModuleContent } from '@/lib/engine/module-content';
import { SourceExcerptRef } from './source-excerpt-ref';

export type UnderstandPanelProps = {
  moduleId: string;
  content: ModuleContent;
  layer: LayerValue;
  onLayerChange: (layer: LayerValue) => void;
  endRef: RefObject<HTMLDivElement | null>;
};

function ItemList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-h3">{title}</h4>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="text-reading">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** E4-02 AC2–AC4: big idea, why it matters, the three layers and the concept map. */
export function UnderstandPanel({
  moduleId,
  content,
  layer,
  onLayerChange,
  endRef,
}: UnderstandPanelProps) {
  const t = useTranslations('reader.module.understand');
  const { layers, conceptMap, keyQuote } = content;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="border-primary/30 bg-primary-soft flex flex-col gap-2 rounded-[var(--radius-card)] border p-5">
        <p className="text-caption text-primary font-semibold tracking-wide uppercase">
          {t('bigIdeaLabel')}
        </p>
        <p className="text-reading break-words">{content.bigIdea}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-h2">{t('whyTitle')}</h2>
        <p className="text-reading text-text-muted break-words">{content.whyItMatters}</p>
      </section>

      {keyQuote ? (
        <figure className="border-border bg-surface-2 flex flex-col gap-2 rounded-[var(--radius-card)] border p-5">
          <p className="text-caption text-text-muted font-semibold tracking-wide uppercase">
            {t('quoteLabel')}
          </p>
          <blockquote className="text-reading break-words">“{keyQuote.text}”</blockquote>
          <figcaption className="text-caption text-text-muted">
            {t('quotePage', { page: keyQuote.page })}
          </figcaption>
        </figure>
      ) : null}

      <LayerToggle
        value={layer}
        onValueChange={onLayerChange}
        layers={{
          eli5: <p className="text-reading break-words">{layers.eli5}</p>,
          practitioner: (
            <ul className="flex flex-col gap-4">
              {layers.practitioner.map((concept, index) => (
                <li key={`${index}-${concept.concept}`} className="flex flex-col gap-2">
                  <p className="text-small font-semibold break-words">{concept.concept}</p>
                  <p className="text-reading break-words">{concept.explanation}</p>
                  {concept.chunkRefs.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {concept.chunkRefs.map((chunkId) => (
                        <SourceExcerptRef key={chunkId} moduleId={moduleId} chunkId={chunkId} />
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ),
          expert: (
            <div className="flex flex-col gap-5">
              <ItemList title={t('expertAssumptions')} items={layers.expert.assumptions} />
              <ItemList title={t('expertEvidence')} items={layers.expert.evidence} />
              <ItemList title={t('expertCritiques')} items={layers.expert.critiques} />
              <ItemList title={t('expertCompare')} items={layers.expert.compareWith} />
            </div>
          ),
        }}
      />

      <ConceptMapLazy nodes={conceptMap.nodes} edges={conceptMap.edges} />

      <div ref={endRef} data-reader-end aria-hidden="true" className="h-px w-full" />
    </div>
  );
}
