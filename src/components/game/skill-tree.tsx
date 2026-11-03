'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/layout/sheet';
import type { SkillTreeDomain, SkillTreeInterest } from '@/lib/game/queries';
import { cn } from '@/lib/utils';
import { DomainDetail } from './domain-detail';
import { LEVEL_STYLE, domainLevelIndex } from './level-meta';
import { ProgressRing } from './progress-ring';

const numberFormat = new Intl.NumberFormat('id-ID');

function DomainButton({ domain, onOpen }: { domain: SkillTreeDomain; onOpen: () => void }) {
  const t = useTranslations('progress.skills');
  const tLevels = useTranslations('game.levels');
  const style = LEVEL_STYLE[domain.level];
  const levelName = tLevels(domain.level);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('domainAria', { name: domain.name, level: levelName })}
      className={cn(
        'bg-surface flex min-h-11 w-full min-w-0 items-center gap-3 rounded-[var(--radius-card)] border-2 p-3 text-left',
        'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
        style.border,
      )}
    >
      <ProgressRing
        fraction={(domainLevelIndex(domain.level) + 1) / 5}
        size={44}
        strokeWidth={5}
        arcClassName={style.stroke}
      />
      <span className="flex min-w-0 flex-col" aria-hidden="true">
        <span className="text-small font-semibold break-words">{domain.name}</span>
        <span className={cn('text-caption font-semibold', style.text)}>
          {t('domainLevel', { level: levelName })} ·{' '}
          {t('domainXp', { xp: numberFormat.format(domain.xp) })}
        </span>
      </span>
    </button>
  );
}

/** E9-02: skill tree grouped per interest; a domain opens a sheet with details. */
export function SkillTree({ interests }: { interests: SkillTreeInterest[] }) {
  const t = useTranslations('progress.skills');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    interests.flatMap((interest) => interest.domains).find((d) => d.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {interests.map((interest) => (
        <section
          key={interest.id}
          aria-labelledby={`interest-${interest.id}`}
          className="flex flex-col gap-3"
        >
          <h3 id={`interest-${interest.id}`} className="text-h3 break-words">
            {interest.name}
          </h3>
          {interest.domains.length === 0 ? (
            <p className="text-small text-text-muted">{t('interestEmpty')}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {interest.domains.map((domain) => (
                <li key={domain.id} className="min-w-0">
                  <DomainButton domain={domain} onOpen={() => setSelectedId(domain.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        title={selected?.name ?? ''}
      >
        {selected ? <DomainDetail domain={selected} /> : null}
      </Sheet>
    </div>
  );
}
