'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { WifiOffIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Thin offline banner (PRD §12.8). Only rendered while the browser reports
 * no connection.
 */
export function OfflineBanner({ className }: { className?: string }) {
  const t = useTranslations('errors');
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className={cn(
        'border-warning/30 bg-warning/15 text-warning text-caption flex items-center justify-center gap-2 border-b px-4 py-2',
        className,
      )}
    >
      <WifiOffIcon className="size-4 shrink-0" aria-hidden="true" />
      {t('offline')}
    </div>
  );
}
