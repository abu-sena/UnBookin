import { Suspense } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="flex w-full max-w-md flex-col gap-8">
        <Link
          href="/"
          className="focus-visible:ring-ring focus-visible:ring-offset-background inline-flex min-h-11 max-w-full items-center self-center rounded-[var(--radius-input)] outline-none focus-visible:ring-2 focus-visible:ring-offset-4"
        >
          <BrandLogo className="w-44" sizes="176px" />
        </Link>
        <div className="border-border bg-surface rounded-[var(--radius-card)] border px-6 py-8 shadow-[var(--shadow-card)] sm:p-8">
          <Suspense
            fallback={
              <div className="bg-surface-2 h-80 animate-pulse rounded-[var(--radius-input)] motion-reduce:animate-none" />
            }
          >
            {children}
          </Suspense>
        </div>
      </div>
    </main>
  );
}
