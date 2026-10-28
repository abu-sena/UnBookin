import { AppShell } from '@/components/layout/app-shell';
import { requireOnboardedUser } from '@/lib/auth/session';
import { getGameSummary, type GameSummary } from '@/lib/game/queries';
import { countDueCards } from '@/lib/learning/queries';
import { Suspense } from 'react';

export async function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser();
  let reviewCount: number | undefined;
  try {
    reviewCount = await countDueCards({ userId: user.id });
  } catch {
    // A badge count must never break the app shell or show an error page.
    reviewCount = undefined;
  }
  let gameSummary: GameSummary | undefined;
  try {
    gameSummary = await getGameSummary({ userId: user.id });
  } catch {
    // Game statistics must never break the app shell.
    gameSummary = undefined;
  }
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
