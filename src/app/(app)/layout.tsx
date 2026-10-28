import { AppShell } from '@/components/layout/app-shell';
import { requireOnboardedUser } from '@/lib/auth/session';
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
  return (
    <AppShell user={user} reviewCount={reviewCount}>
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
