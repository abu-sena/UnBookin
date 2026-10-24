import { CloudOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ErrorStateProps = {
  /** Human-readable message without technical jargon (PRD §12.8). */
  message: string;
  /** Label for the recovery action, e.g. "Coba lagi". */
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
};

/**
 * Error state: a friendly message plus one recovery action (PRD §12.8).
 */
export function ErrorState({ message, retryLabel, onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        'border-border bg-surface flex flex-col items-center gap-4 rounded-[var(--radius-card)] border px-6 py-10 text-center',
        className,
      )}
    >
      <span
        className="border-border bg-surface-2 text-danger flex size-16 items-center justify-center rounded-[var(--radius-full)] border"
        aria-hidden="true"
      >
        <CloudOffIcon className="size-7" />
      </span>
      <p className="text-body text-text-muted max-w-xs text-balance">{message}</p>
      {retryLabel ? (
        <Button variant="outline" onClick={onRetry} disabled={onRetry === undefined}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
