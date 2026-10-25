import {
  AwardIcon,
  BookOpenIcon,
  BrainIcon,
  CheckCheckIcon,
  CompassIcon,
  FlameIcon,
  FootprintsIcon,
  GraduationCapIcon,
  HammerIcon,
  LibraryIcon,
  RepeatIcon,
  SproutIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const badgeIcons: Record<string, LucideIcon> = {
  footprints: FootprintsIcon,
  'book-open': BookOpenIcon,
  'check-check': CheckCheckIcon,
  hammer: HammerIcon,
  flame: FlameIcon,
  brain: BrainIcon,
  compass: CompassIcon,
  sprout: SproutIcon,
  library: LibraryIcon,
  'graduation-cap': GraduationCapIcon,
  repeat: RepeatIcon,
};

const tierClasses: Record<'bronze' | 'silver' | 'gold', string> = {
  bronze: 'bg-warning/10 text-warning',
  silver: 'bg-surface-2 text-text',
  gold: 'bg-xp/10 text-xp',
};

export type BadgeCardProps = {
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  earned: boolean;
  /** Localised label announced for locked badges. */
  lockedLabel: string;
  className?: string;
};

/**
 * Simple `BadgeCard` (PRD §12.7): earned badges show their icon in colour,
 * locked badges render as a muted silhouette.
 */
export function BadgeCard({
  name,
  description,
  icon,
  tier,
  earned,
  lockedLabel,
  className,
}: BadgeCardProps) {
  const Icon = badgeIcons[icon] ?? AwardIcon;

  return (
    <li
      className={cn(
        'border-border bg-surface flex flex-col items-center gap-2 rounded-[var(--radius-card)] border p-3 text-center',
        !earned && 'opacity-70',
        className,
      )}
      aria-label={earned ? name : `${name} — ${lockedLabel}`}
    >
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-[var(--radius-full)]',
          earned ? tierClasses[tier] : 'bg-surface-2 text-text-muted',
        )}
        aria-hidden="true"
      >
        <Icon className={cn('size-6', !earned && 'opacity-40 grayscale')} />
      </span>
      <span className="text-caption font-semibold">{name}</span>
      <span className="text-caption text-text-muted line-clamp-2">{description}</span>
    </li>
  );
}
