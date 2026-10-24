import { getTranslations } from 'next-intl/server';
import { Flame, Star } from 'lucide-react';

/**
 * Static, calm gamification visuals (E0-01 AC2). The `--xp` colour is used
 * for game elements only; all copy stays in neutral text colours for AA
 * contrast. Pure CSS/SVG — no client JS.
 */
export async function Gamification() {
  const t = await getTranslations('landing');

  const items = [
    { key: 'xp', visual: <XPBar gain={t('gamification.xp.gain')} /> },
    { key: 'streak', visual: <StreakFlame value={12} /> },
    { key: 'level', visual: <LevelRing value={7} progress={0.68} /> },
    { key: 'badges', visual: <Badges unlocked={2} total={3} /> },
  ] as const;

  return (
    <section aria-labelledby="gamifikasi-title" className="py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <h2 id="gamifikasi-title" className="text-h2">
          {t('gamification.title')}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-xl">{t('gamification.subtitle')}</p>
        <div className="mt-6 grid gap-x-6 gap-y-6 sm:mt-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ key, visual }) => (
            <div key={key} className="flex items-start gap-4">
              <div className="mt-0.5 shrink-0">{visual}</div>
              <div>
                <p className="text-small font-semibold">{t(`gamification.${key}.label`)}</p>
                <p className="text-muted-foreground mt-1">{t(`gamification.${key}.line`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** XP progress bar with a small "+30 XP" gain marker (PRD §12.7 XPToast). */
function XPBar({ gain }: { gain: string }) {
  return (
    <div className="w-24" aria-hidden="true">
      <div className="bg-primary-soft h-2 w-full rounded-full">
        <div className="bg-xp h-2 w-[68%] rounded-full" />
      </div>
      <p className="text-caption mt-1 font-semibold">{gain}</p>
    </div>
  );
}

/** Streak flame with the day count (PRD §12.7 StreakFlame). */
function StreakFlame({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      <Flame className="text-xp size-8 fill-current" strokeWidth={1.5} />
      <span className="text-h3 font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

/** Level progress ring (PRD §12.7 LevelRing). */
function LevelRing({ value, progress }: { value: number; progress: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative size-12" aria-hidden="true">
      <svg viewBox="0 0 48 48" className="size-12">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="var(--xp)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <span
        className="text-small absolute inset-0 flex items-center justify-center font-semibold"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  );
}

/** Badge row: unlocked medals in the XP colour, locked ones as silhouettes. */
function Badges({ unlocked, total }: { unlocked: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => {
        const isUnlocked = index < unlocked;
        return (
          <span
            key={index}
            className={
              isUnlocked
                ? 'bg-xp/15 text-xp flex size-7 items-center justify-center rounded-full'
                : 'bg-surface-2 text-muted-foreground/50 flex size-7 items-center justify-center rounded-full'
            }
          >
            <Star className="size-4" fill="currentColor" strokeWidth={0} />
          </span>
        );
      })}
    </div>
  );
}
