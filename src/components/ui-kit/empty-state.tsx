import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  /** Simple line icon illustrating the empty context (PRD §12.8). */
  icon: LucideIcon;
  /** One human sentence explaining what is empty. */
  message: string;
  /** Label of the single call-to-action button. */
  actionLabel?: string;
  /** Optional destination for the call-to-action. */
  actionHref?: string;
  /** Optional click handler; the button renders disabled without one. */
  onAction?: () => void;
  className?: string;
};

/**
 * Empty state: simple line icon, one sentence and a single button (PRD §12.8).
 */
export function EmptyState({
  icon: Icon,
  message,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  const action = actionLabel ? (
    actionHref ? (
      <Button asChild>
        <a href={actionHref}>{actionLabel}</a>
      </Button>
    ) : (
      <Button onClick={onAction} disabled={onAction === undefined}>
        {actionLabel}
      </Button>
    )
  ) : null;

  return (
    <div
      className={cn(
        'border-border bg-surface flex flex-col items-center gap-4 rounded-[var(--radius-card)] border px-6 py-10 text-center',
        className,
      )}
    >
      <span
        className="border-border bg-surface-2 text-text-muted flex size-16 items-center justify-center rounded-[var(--radius-full)] border"
        aria-hidden="true"
      >
        <Icon className="size-7" />
      </span>
      <p className="text-body text-text-muted max-w-xs text-balance">{message}</p>
      {action}
    </div>
  );
}
