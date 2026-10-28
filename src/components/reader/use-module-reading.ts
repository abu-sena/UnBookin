'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { markModuleRead, markModuleReading } from '@/lib/learning/actions';
import type { LearningResult } from '@/lib/learning/errors';

export type ModuleReadingState = {
  read: boolean;
  xpAwarded: boolean;
};

/**
 * E4-02 AC7: mark the module as reading once on open, then as read once when
 * the reader has seen the end of Pahami and opened Terapkan. A module that is
 * already read is never downgraded by a second `markModuleReading`.
 */
export function useModuleReading({
  moduleId,
  initiallyRead,
  reachedEnd,
  applyOpened,
}: {
  moduleId: string;
  initiallyRead: boolean;
  reachedEnd: boolean;
  applyOpened: boolean;
}): ModuleReadingState {
  const router = useRouter();
  const [read, setRead] = useState(initiallyRead);
  const [xpAwarded, setXpAwarded] = useState(false);
  const readingCalledRef = useRef(false);
  const readCalledRef = useRef(false);

  useEffect(() => {
    if (initiallyRead || readingCalledRef.current) return;
    readingCalledRef.current = true;
    void markModuleReading({ moduleId }).catch(() => undefined);
  }, [moduleId, initiallyRead]);

  const markRead = useCallback(() => {
    if (initiallyRead || readCalledRef.current) return;
    readCalledRef.current = true;
    void (async () => {
      try {
        const result = (await markModuleRead({ moduleId })) as unknown as LearningResult<{
          status: 'read';
          xpAwarded: boolean;
          cardsQueued: number;
        }>;
        if (!result.ok) {
          readCalledRef.current = false;
          return;
        }
        setRead(true);
        if (result.xpAwarded) {
          setXpAwarded(true);
          // Refresh the server snapshot once so streak and level show at once.
          router.refresh();
        }
      } catch {
        readCalledRef.current = false;
      }
    })();
  }, [moduleId, initiallyRead, router]);

  useEffect(() => {
    if (reachedEnd && applyOpened) markRead();
  }, [reachedEnd, applyOpened, markRead]);

  return { read, xpAwarded };
}
