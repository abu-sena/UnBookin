import { BookOpenIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui-kit/empty-state';

export type ReviewQueueEmptyProps = {
  onStart?: () => void;
  className?: string;
};

/** Empty daily review queue (E6-01, PRD §12.8). */
export function ReviewQueueEmpty({ onStart, className }: ReviewQueueEmptyProps) {
  const t = useTranslations('review.empty');

  return (
    <EmptyState
      icon={BookOpenIcon}
      message={t('message')}
      actionLabel={t('action')}
      onAction={onStart}
      className={className}
    />
  );
}
