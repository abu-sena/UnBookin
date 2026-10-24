import type { LucideIcon } from 'lucide-react';
import { HistoryIcon, HomeIcon, LibraryIcon, TrendingUpIcon } from 'lucide-react';

export type NavItem = {
  href: string;
  labelKey: 'home' | 'library' | 'review' | 'progress';
  icon: LucideIcon;
};

/**
 * The four destinations shared by the mobile bottom navigation and the
 * desktop side navigation (PRD §12.5). The "Unbook" FAB is rendered
 * separately so it can be raised in the middle of the bottom bar.
 */
export const navItems: NavItem[] = [
  { href: '/home', labelKey: 'home', icon: HomeIcon },
  { href: '/library', labelKey: 'library', icon: LibraryIcon },
  { href: '/review', labelKey: 'review', icon: HistoryIcon },
  { href: '/progress', labelKey: 'progress', icon: TrendingUpIcon },
];
