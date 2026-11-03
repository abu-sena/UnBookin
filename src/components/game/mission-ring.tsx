import { CheckIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ProgressRing } from './progress-ring';

export type MissionRingProps = {
  title: string;
  progress: number;
  target: number;
  completed: boolean;
  className?: string;
};

/** Small SVG ring for one weekly mission, a real progressbar (E8-06). */
export function MissionRing({ title, progress, target, completed, className }: MissionRingProps) {
  const t = useTranslations('game.mission');
  const max = Math.max(1, Number.isFinite(target) ? Math.floor(target) : 1);
  const now = Math.min(max, Math.max(0, Number.isFinite(progress) ? Math.floor(progress) : 0));

  return (
    <div
      role="progressbar"
      aria-label={t('progressAria', { title, progress: now, target: max })}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      className={cn('shrink-0', className)}
    >
      <ProgressRing
        fraction={now / max}
        size={44}
        strokeWidth={5}
        arcClassName={completed ? 'stroke-success' : 'stroke-primary'}
      >
        {completed ? <CheckIcon className="text-success size-5" aria-hidden="true" /> : null}
      </ProgressRing>
    </div>
  );
}
