export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Suspense
          fallback={
            <div className="bg-surface h-80 animate-pulse rounded-xl motion-reduce:animate-none" />
          }
        >
          {children}
        </Suspense>
      </div>
    </main>
  );
}
import { Suspense } from 'react';
