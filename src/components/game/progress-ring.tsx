import { cn } from '@/lib/utils';
import { clampFraction } from './level-meta';

type ProgressRingProps = {
  /** Fraction in [0, 1]; out-of-range values are clamped. */
  fraction: number;
  size: number;
  strokeWidth?: number;
  /** Stroke colour class for the progress arc (semantic token). */
  arcClassName?: string;
  className?: string;
  children?: React.ReactNode;
};

/**
 * Decorative SVG ring. It carries no semantics itself: wrap it in an element
 * with `role="progressbar"` or an accessible label.
 */
export function ProgressRing({
  fraction,
  size,
  strokeWidth = 8,
  arcClassName = 'stroke-primary',
  className,
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clampFraction(fraction));

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={cn('duration-slow ease-out-soft transition-[stroke-dashoffset]', arcClassName)}
        />
      </svg>
      {children ? (
        <span className="absolute inset-0 flex items-center justify-center text-center">
          {children}
        </span>
      ) : null}
    </span>
  );
}
