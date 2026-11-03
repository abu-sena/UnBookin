import { AppShell } from '@/components/layout/app-shell';
import { requireOnboardedUser } from '@/lib/auth/session';
import { getGameSummary } from '@/lib/game/queries';
import { countDueCards } from '@/lib/learning/queries';
import { Suspense } from 'react';

export async function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser();
  // Neither the badge count nor game statistics may ever break the app shell.
  const [dueCards, game] = await Promise.allSettled([
    countDueCards({ userId: user.id }),
    getGameSummary({ userId: user.id }),
  ]);
  const reviewCount = dueCards.status === 'fulfilled' ? dueCards.value : undefined;
  const gameSummary = game.status === 'fulfilled' ? game.value : undefined;
  return (
    <AppShell user={user} reviewCount={reviewCount} gameSummary={gameSummary} gameUserId={user.id}>
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="bg-surface mx-auto mt-14 h-64 w-full max-w-sm animate-pulse rounded-xl motion-reduce:animate-none" />
      }
    >
      <AuthenticatedApp>{children}</AuthenticatedApp>
    </Suspense>
  );
}
