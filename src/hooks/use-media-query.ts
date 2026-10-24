import { useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 * Returns `undefined` on the server (and during SSR rendering) so hydration
 * output stays deterministic.
 */
export function useMediaQuery(query: string): boolean | undefined {
  const subscribe = (onStoreChange: () => void) => {
    const mediaQueryList = window.matchMedia(query);
    mediaQueryList.addEventListener('change', onStoreChange);
    return () => {
      mediaQueryList.removeEventListener('change', onStoreChange);
    };
  };

  const getSnapshot = () => window.matchMedia(query).matches;
  const getServerSnapshot = () => undefined;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
