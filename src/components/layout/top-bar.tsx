import { getTranslations } from 'next-intl/server';
import { BellIcon, FlameIcon, UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

type TopBarProps = {
  /** Optional page title; defaults to the app name. */
  title?: string;
  /** Streak day count; omitted renders the flame placeholder only. */
  streakCount?: number;
};

export async function TopBar({ title, streakCount }: TopBarProps) {
  const [tCommon, tTopBar] = await Promise.all([
    getTranslations('common'),
    getTranslations('topBar'),
  ]);

  return (
    <header className="border-border bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-2 px-4 lg:px-6">
        <h1 className="text-h3 truncate">{title ?? tCommon('appName')}</h1>

        <div className="flex items-center gap-1">
          <span
            className="text-small text-xp inline-flex min-h-11 items-center gap-1 px-2 font-semibold tabular-nums"
            aria-label={
              streakCount === undefined
                ? tTopBar('streakAria')
                : tTopBar('streakAriaCount', { count: streakCount })
            }
          >
            <FlameIcon className="size-5" aria-hidden="true" />
            {streakCount}
          </span>

          <Button variant="ghost" size="icon" aria-label={tTopBar('notifications')}>
            <BellIcon aria-hidden="true" />
          </Button>

          <Button variant="ghost" size="icon" aria-label={tTopBar('profile')}>
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary-soft text-primary">
                <UserIcon className="size-4" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
          </Button>
        </div>
      </div>
    </header>
  );
}
