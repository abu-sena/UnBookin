'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { XPToast } from '@/components/game/xp-toast';
import { ActionCard } from '@/components/module/action-card';
import { ChecklistTool } from '@/components/module/checklist-tool';
import { ConceptMapLazy } from '@/components/module/concept-map-lazy';
import { FlipCard, ReviewRatingBar } from '@/components/module/flip-card';
import { LayerToggle, type LayerValue } from '@/components/module/layer-toggle';
import { ModulePath } from '@/components/module/path-node';
import { ModulePageSkeleton, ModulePathSkeleton, ReviewCardSkeleton } from '@/components/module/module-skeletons';
import { ReviewQueueEmpty } from '@/components/module/review-queue-empty';
import { SourceRef } from '@/components/module/source-ref';
import { LearningQuizShowcase } from './learning-quiz-showcase';
import { sampleModule, samplePathNodes } from './learning-fixtures';

export function LearningShowcase() {
  const t = useTranslations('module.showcase');
  const [layer, setLayer] = useState<LayerValue>('eli5');
  const [checked, setChecked] = useState<number[]>([0, 2]);
  const [flipped, setFlipped] = useState(false);
  const tool = sampleModule.application.tools[0];
  const action = sampleModule.application.actionThisWeek;

  return (
    <div className="flex flex-col gap-8">
      <p className="text-body text-text-muted">{t('description')}</p>

      <Subsection title={t('path')}>
        <ModulePath nodes={samplePathNodes} onSelect={() => undefined} />
      </Subsection>

      <Subsection title={t('layers')}>
        <LayerToggle
          value={layer}
          onValueChange={setLayer}
          layers={{
            eli5: <p className="text-reading">{sampleModule.layers.eli5}</p>,
            practitioner: (
              <ul className="flex flex-col gap-3">
                {sampleModule.layers.practitioner.map((item) => (
                  <li key={item.concept}>
                    <p className="text-small font-semibold">{item.concept}</p>
                    <p className="text-reading">{item.explanation}</p>
                  </li>
                ))}
              </ul>
            ),
            expert: (
              <ul className="flex flex-col gap-2">
                {sampleModule.layers.expert.critiques.map((item) => (
                  <li key={item} className="text-reading">
                    {item}
                  </li>
                ))}
              </ul>
            ),
          }}
        />
      </Subsection>

      <Subsection title={t('conceptMap')}>
        <ConceptMapLazy nodes={sampleModule.conceptMap.nodes} edges={sampleModule.conceptMap.edges} />
      </Subsection>

      <Subsection title={t('source')}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-muted">{t('sourceLoading')}</span>
          <SourceRef page={42} excerpt={{ status: 'loading' }} />
          <span className="text-caption text-text-muted">{t('sourceReady')}</span>
          <SourceRef
            page={42}
            excerpt={{
              status: 'ready',
              excerpt: sampleModule.keyQuote?.text,
              pageFrom: 42,
              pageTo: 43,
            }}
          />
          <span className="text-caption text-text-muted">{t('sourceError')}</span>
          <SourceRef page={45} excerpt={{ status: 'error' }} onRetry={() => undefined} />
        </div>
      </Subsection>

      <Subsection title={t('action')}>
        <div className="grid gap-4 lg:grid-cols-3">
          <ActionCard title={action.title} steps={action.steps} doneWhen={action.doneWhen} status="idle" />
          <ActionCard title={action.title} steps={action.steps} doneWhen={action.doneWhen} status="pending" />
          <ActionCard
            title={action.title}
            steps={action.steps}
            doneWhen={action.doneWhen}
            status="created"
            dueDateText="3 November 2026"
          />
        </div>
      </Subsection>

      <Subsection title={t('checklist')}>
        {tool ? (
          <ChecklistTool
            title={tool.name}
            items={tool.items}
            checked={checked}
            onToggle={(index) =>
              setChecked((current) =>
                current.includes(index)
                  ? current.filter((item) => item !== index)
                  : [...current, index],
              )
            }
          />
        ) : null}
      </Subsection>

      <Subsection title={t('review')}>
        <div className="flex flex-col gap-3">
          <FlipCard
            front="Apa inti dari sistem, bukan panggung?"
            back="Pemimpin membangun cara kerja yang bertahan tanpa dirinya."
            flipped={flipped}
            onFlip={() => setFlipped((current) => !current)}
          />
          <ReviewRatingBar disabled={!flipped} onRate={() => undefined} />
        </div>
      </Subsection>

      <Subsection title={t('xp')}>
        <XPToast amount={30} />
      </Subsection>

      <div className="flex flex-col gap-8">
        <LearningQuizShowcase />
      </div>

      <Subsection title={t('skeletons')}>
        <div className="grid gap-6 md:grid-cols-3">
          <ModulePageSkeleton />
          <ModulePathSkeleton />
          <ReviewCardSkeleton />
        </div>
      </Subsection>

      <Subsection title={t('emptyReview')}>
        <ReviewQueueEmpty onStart={() => undefined} />
      </Subsection>
    </div>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-h3">{title}</h3>
      {children}
    </section>
  );
}
