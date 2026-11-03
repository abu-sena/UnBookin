'use client';

import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/layout/sheet';
import { Button } from '@/components/ui/button';
import type { BadgeEarned, DomainLevelUp } from './game-feedback-diff';

export type CelebrationData = {
  levelUp: { level: number; totalXp: number } | null;
  domainLevelUps: DomainLevelUp[];
  badges: BadgeEarned[];
};

const CONFETTI = [
  { left: '8%', delay: '0ms', tone: 'bg-xp' },
  { left: '22%', delay: '120ms', tone: 'bg-primary' },
  { left: '36%', delay: '60ms', tone: 'bg-success' },
  { left: '50%', delay: '200ms', tone: 'bg-level-proficient' },
  { left: '64%', delay: '90ms', tone: 'bg-xp' },
  { left: '78%', delay: '160ms', tone: 'bg-level-advanced-beginner' },
  { left: '90%', delay: '30ms', tone: 'bg-success' },
] as const;

/** Subtle CSS-only confetti; hidden entirely under prefers-reduced-motion. */
function Confetti() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden"
    >
      {CONFETTI.map((piece) => (
        <span
          key={piece.left}
          className={`confetti-piece absolute top-0 block h-3 w-1.5 rounded-sm ${piece.tone}`}
          style={{ left: piece.left, animationDelay: piece.delay }}
        />
      ))}
    </div>
  );
}

type LevelUpCelebrationProps = {
  data: CelebrationData | null;
  onClose: () => void;
};

/**
 * One celebration for player level and/or Dreyfus domain level increases
 * (E8-02, Alur C). Bottom sheet on phones, dialog on desktop.
 */
export function LevelUpCelebration({ data, onClose }: LevelUpCelebrationProps) {
  const t = useTranslations('game.celebration');
  const tLevels = useTranslations('game.levels');
  const numberFormat = new Intl.NumberFormat('id-ID');

  const title = !data
    ? t('titleLevel')
    : data.levelUp && data.domainLevelUps.length > 0
      ? t('titleBoth')
      : data.levelUp
        ? t('titleLevel')
        : t('titleDomain');

  return (
    <Sheet
      open={data !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={t('description')}
    >
      {data ? (
        <div className="relative flex flex-col gap-4">
          <Confetti />
          <ul className="text-body flex flex-col gap-2">
            {data.levelUp ? (
              <>
                <li className="font-semibold">{t('levelLine', { level: data.levelUp.level })}</li>
                <li className="text-text-muted">
                  {t('xpLine', { xp: numberFormat.format(data.levelUp.totalXp) })}
                </li>
              </>
            ) : null}
            {data.domainLevelUps.map((domain) => (
              <li key={domain.id} className="break-words">
                {t('domainLine', { domain: domain.name, level: tLevels(domain.level) })}
              </li>
            ))}
            {data.badges.map((badge) => (
              <li key={badge.id} className="text-text-muted break-words">
                {badge.name}
              </li>
            ))}
          </ul>
          <Button type="button" className="w-full" onClick={onClose}>
            {t('close')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
