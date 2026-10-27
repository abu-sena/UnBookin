'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PlusIcon } from 'lucide-react';
import { navItems } from '@/components/layout/nav-items';
import { SourceUploadTrigger } from '@/components/sources/upload-trigger';
import { cn } from '@/lib/utils';

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Desktop navigation (≥ 1024px), 240px wide — PRD §12.5.
 * The same destinations as the mobile bottom navigation.
 */
export function SideNav({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');

  return (
    <aside className="border-border sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r lg:flex">
      <div className="px-4 py-5">
        <span className="text-h3 px-2 font-bold">{tCommon('appName')}</span>
      </div>

      <nav aria-label={t('ariaLabel')} className="flex flex-1 flex-col gap-1 px-3">
        {navItems.slice(0, 2).map((item) => (
          <SideNavItem
            key={item.href}
            href={item.href}
            icon={<item.icon className="size-5" aria-hidden="true" />}
            label={t(item.labelKey)}
            active={isActive(pathname, item.href)}
          />
        ))}

        <SourceUploadTrigger
          className={cn(
            'text-primary-fg bg-primary text-small mt-2 flex min-h-11 items-center gap-3 rounded-[var(--radius-button)] px-4 py-2',
            'duration-fast ease-out-soft shadow-[var(--shadow-card)] transition-transform active:scale-[0.97]',
          )}
        >
          <PlusIcon className="size-5" aria-hidden="true" />
          {t('unbook')}
        </SourceUploadTrigger>

        {navItems.slice(2).map((item) => (
          <SideNavItem
            key={item.href}
            href={item.href}
            icon={<item.icon className="size-5" aria-hidden="true" />}
            label={t(item.labelKey)}
            active={isActive(pathname, item.href)}
            badgeCount={item.labelKey === 'review' && reviewCount > 0 ? reviewCount : undefined}
          />
        ))}
      </nav>
    </aside>
  );
}

type SideNavItemProps = {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badgeCount?: number;
};

function SideNavItem({ href, icon, label, active, badgeCount }: SideNavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'text-small duration-fast ease-out-soft relative flex min-h-11 items-center gap-3 rounded-[var(--radius-button)] px-3 py-2 transition-colors',
        active
          ? 'bg-primary-soft text-primary font-semibold'
          : 'text-text-muted hover:bg-surface-2',
      )}
    >
      {icon}
      <span>{label}</span>
      {badgeCount !== undefined && (
        <span className="bg-danger text-primary-fg text-caption ml-auto flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-full)] px-1.5 font-semibold tabular-nums">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </Link>
  );
}
