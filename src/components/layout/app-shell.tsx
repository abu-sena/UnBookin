import { BottomNav } from '@/components/layout/bottom-nav';
import { ReadingSizeSync } from '@/components/layout/reading-size-sync';
import { SideNav } from '@/components/layout/side-nav';
import { TopBar } from '@/components/layout/top-bar';
import { OfflineBanner } from '@/components/ui-kit/offline-banner';
import { cn } from '@/lib/utils';

type AppShellWidth = 'reading' | 'dashboard';

const contentWidthByWidth: Record<AppShellWidth, string> = {
  reading: 'lg:max-w-[720px]',
  dashboard: 'lg:max-w-[1120px]',
};

type AppShellProps = {
  user?: { name?: string | null; image?: string | null };
  children: React.ReactNode;
  /** Content width on desktop: `reading` 720px, `dashboard` 1120px (PRD §12.5). */
  width?: AppShellWidth;
  /** Page title shown in the top bar; defaults to the app name. */
  title?: string;
  /** Review cards due; forwarded to the navigation badge. */
  reviewCount?: number;
};

/**
 * Application chrome: top bar, desktop side navigation (≥ 1024px) and the
 * mobile bottom navigation (< 1024px). Content is centred at 640px on
 * tablets (PRD §12.5).
 */
export function AppShell({ children, width = 'reading', title, reviewCount, user }: AppShellProps) {
  return (
    <div className="flex min-h-dvh">
      <ReadingSizeSync />
      <SideNav reviewCount={reviewCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <TopBar title={title} user={user} />
        <main
          className={cn(
            'mx-auto w-full max-w-[640px] flex-1 px-4 pt-4 pb-28 lg:px-6 lg:pb-10',
            contentWidthByWidth[width],
          )}
        >
          {children}
        </main>
        <BottomNav reviewCount={reviewCount} />
      </div>
    </div>
  );
}
