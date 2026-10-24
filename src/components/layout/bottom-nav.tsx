'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PlusIcon } from 'lucide-react';
import { navItems } from '@/components/layout/nav-items';
import { cn } from '@/lib/utils';

type BottomNavProps = {
  /** Number of cards due for review; renders a badge on the Review item. */
  reviewCount?: number;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({ reviewCount = 0 }: BottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur lg:hidden"
    >
      <div
        className="mx-auto grid w-full max-w-[640px] grid-cols-5 items-end px-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {navItems.slice(0, 2).map((item) => (
          <BottomNavItem
            key={item.href}
            href={item.href}
            icon={<item.icon className="size-5" aria-hidden="true" />}
            label={t(item.labelKey)}
            active={isActive(pathname, item.href)}
          />
        ))}

        <div className="flex justify-center">
          <button
            type="button"
            aria-label={t('unbookAria')}
            className={cn(
              'text-primary-fg bg-primary -translate-y-4',
              'flex size-14 items-center justify-center rounded-[var(--radius-full)]',
              'duration-fast ease-out-soft shadow-[var(--shadow-fab)] transition-transform',
              'active:scale-[0.97]',
            )}
          >
            <PlusIcon className="size-6" aria-hidden="true" />
          </button>
        </div>

        {navItems.slice(2).map((item) => (
          <BottomNavItem
            key={item.href}
            href={item.href}
            icon={<item.icon className="size-5" aria-hidden="true" />}
            label={t(item.labelKey)}
            active={isActive(pathname, item.href)}
            badgeCount={item.labelKey === 'review' && reviewCount > 0 ? reviewCount : undefined}
          />
        ))}
      </div>
    </nav>
  );
}

type BottomNavItemProps = {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badgeCount?: number;
};

function BottomNavItem({ href, icon, label, active, badgeCount }: BottomNavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'text-caption duration-fast ease-out-soft relative flex min-h-14 min-w-11 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 transition-colors',
        active ? 'text-primary font-semibold' : 'text-text-muted',
      )}
    >
      <span className="relative">
        {icon}
        {badgeCount !== undefined && (
          <span className="bg-danger text-primary-fg text-caption absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-full)] px-1 font-semibold tabular-nums">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </span>
      <span aria-hidden="true">{label}</span>
    </Link>
  );
}
