'use client';

import { createContext, useContext } from 'react';

export type GameFeedbackContextValue = {
  /** True once for the first active day load per user and local date. */
  streakPulse: boolean;
};

export const GameFeedbackContext = createContext<GameFeedbackContextValue | null>(null);

/** Returns `null` outside the provider (for example in /dev/ui previews). */
export function useGameFeedback(): GameFeedbackContextValue | null {
  return useContext(GameFeedbackContext);
}
