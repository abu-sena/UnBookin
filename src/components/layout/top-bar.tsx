import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { BellIcon, FlameIcon, SettingsIcon, UserIcon, UserRoundIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOutAction } from '@/lib/auth/actions';
import { BrandLogo } from '@/components/brand-logo';

type TopBarProps = {
  user?: { name?: string | null; image?: string | null };
  /** Optional page title; defaults to the app name. */
  title?: string;
  /** Streak day count; omitted renders the flame placeholder only. */
  streakCount?: number;
};

export async function TopBar({ title, streakCount, user }: TopBarProps) {
  const [tTopBar, tAuth, tProfile, tSettings] = await Promise.all([
    getTranslations('topBar'),
    getTranslations('auth'),
    getTranslations('profile'),
    getTranslations('settings'),
  ]);

  return (
    <header className="border-border bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-2 px-4 lg:px-6">
        {title ? (
          <h1 className="text-h3 truncate">{title}</h1>
        ) : (
          <Link href="/home" className="inline-flex min-h-11 min-w-0 items-center">
            <BrandLogo className="w-28 sm:w-36" sizes="(min-width: 640px) 144px, 112px" />
          </Link>
        )}

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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={tTopBar('profile')}>
                <Avatar className="size-8">
                  {user?.image && (
                    <AvatarImage src={user.image} alt={user.name ?? tTopBar('profile')} />
                  )}
                  <AvatarFallback className="bg-primary-soft text-primary">
                    {user?.name?.trim().slice(0, 2).toUpperCase() || (
                      <UserIcon className="size-4" aria-hidden="true" />
                    )}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {user?.name && (
                <DropdownMenuLabel className="max-w-56 truncate">{user.name}</DropdownMenuLabel>
              )}
              <DropdownMenuItem asChild>
                <Link href="/profile" className="min-h-11 w-full">
                  <UserRoundIcon />
                  {tProfile('title')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="min-h-11 w-full">
                  <SettingsIcon />
                  {tSettings('title')}
                </Link>
              </DropdownMenuItem>
              <form action={signOutAction}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="min-h-11 w-full">
                    {tAuth('signOut')}
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
