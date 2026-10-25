import { AppShell } from '@/components/layout/app-shell';
import { requireOnboardedUser } from '@/lib/auth/session';
import { Suspense } from 'react';

async function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser();
  return <AppShell user={user}>{children}</AppShell>;
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
