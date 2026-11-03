'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { GameSummary } from '@/lib/game/queries';
import { XPToast } from './xp-toast';
import { GameFeedbackContext } from './game-feedback-context';
import { diffGameSummary, hasCelebration } from './game-feedback-diff';
import { LevelUpCelebration, type CelebrationData } from './level-up-celebration';

type GameFeedbackProviderProps = {
  /** Trusted id from the server session; snapshots never cross users. */
  userId: string;
  /** Current server snapshot; `undefined` when the stats query failed. */
  summary: GameSummary | undefined;
  children: React.ReactNode;
};

type Tracked = { userId: string; summary: GameSummary | undefined };
type Toast = { key: number; xp: number; badge: string | null };

const TOAST_MS = 1_300;

function pulseStorageKey(userId: string) {
  return `unbookin:streak-pulse:${userId}`;
}

/**
 * Turns server snapshot changes (after `router.refresh()`) into feedback.
 * The first snapshot per user is only remembered, never celebrated. All
 * numbers come from the server; nothing is computed or mutated locally.
 *
 * Toast choice: M5 screens already show an inline XPToast for the XP of the
 * action itself, so the global toast only reports what they cannot know:
 * weekly mission rewards and newly earned badges.
 */
export function GameFeedbackProvider({ userId, summary, children }: GameFeedbackProviderProps) {
  const t = useTranslations('game.feedback');
  const [tracked, setTracked] = useState<Tracked>({ userId, summary });
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [streakPulse, setStreakPulse] = useState(false);

  // Adjust state while rendering when the snapshot or user changes.
  if (tracked.userId !== userId) {
    setTracked({ userId, summary });
    setCelebration(null);
    setToast(null);
    setStreakPulse(false);
  } else if (summary && tracked.summary !== summary) {
    if (tracked.summary) {
      const delta = diffGameSummary(tracked.summary, summary);
      if (hasCelebration(delta)) {
        setCelebration({
          levelUp: delta.levelUp,
          domainLevelUps: delta.domainLevelUps,
          badges: delta.newBadges,
        });
        setToast(null);
      } else if (delta.missionXp > 0 || delta.newBadges.length > 0) {
        setToast({
          key: summary.totalXp,
          xp: delta.missionXp,
          badge: delta.newBadges[0]?.name ?? null,
        });
      }
    }
    setTracked({ userId, summary });
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeToday = summary?.activeToday === true;
  const today = summary?.today;
  useEffect(() => {
    if (!activeToday || !today) return;
    // Decided after mount so server and client markup match; at most once per
    // user and server-reported local date.
    const timer = window.setTimeout(() => {
      try {
        const key = pulseStorageKey(userId);
        if (window.localStorage.getItem(key) === today) return;
        window.localStorage.setItem(key, today);
        setStreakPulse(true);
      } catch {
        // Storage can be blocked; the streak simply does not animate.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeToday, today, userId]);

  const contextValue = useMemo(() => ({ streakPulse }), [streakPulse]);

  return (
    <GameFeedbackContext.Provider value={contextValue}>
      {children}
      <LevelUpCelebration data={celebration} onClose={() => setCelebration(null)} />
      <div
        role="status"
        aria-live="polite"
        aria-label={t('liveLabel')}
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-1 lg:bottom-6"
      >
        {toast && toast.xp > 0 ? <XPToast key={toast.key} amount={toast.xp} /> : null}
        {toast?.badge ? (
          <p className="xp-toast-motion text-small bg-surface border-border rounded-[var(--radius-full)] border px-3 py-1 font-semibold">
            {t('badgeToast', { name: toast.badge })}
          </p>
        ) : null}
      </div>
    </GameFeedbackContext.Provider>
  );
}
