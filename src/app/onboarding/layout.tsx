export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-background flex min-h-dvh justify-center px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="w-full max-w-[480px]">{children}</div>
    </main>
  );
}
