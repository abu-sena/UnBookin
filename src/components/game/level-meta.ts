import { DOMAIN_LEVELS, type DomainLevel } from '@/lib/game/domains';

/**
 * Semantic Tailwind classes per Dreyfus level. Colours come from the
 * `--level-*` tokens in globals.css; `text` uses the AA-readable variant.
 * Level is always also written as text, never colour alone.
 */
export const LEVEL_STYLE: Record<
  DomainLevel,
  { stroke: string; text: string; border: string; soft: string }
> = {
  novice: {
    stroke: 'stroke-level-novice',
    text: 'text-level-novice-text',
    border: 'border-level-novice',
    soft: 'bg-level-novice/15',
  },
  advanced_beginner: {
    stroke: 'stroke-level-advanced-beginner',
    text: 'text-level-advanced-beginner-text',
    border: 'border-level-advanced-beginner',
    soft: 'bg-level-advanced-beginner/15',
  },
  competent: {
    stroke: 'stroke-level-competent',
    text: 'text-level-competent-text',
    border: 'border-level-competent',
    soft: 'bg-level-competent/15',
  },
  proficient: {
    stroke: 'stroke-level-proficient',
    text: 'text-level-proficient-text',
    border: 'border-level-proficient',
    soft: 'bg-level-proficient/15',
  },
  expert: {
    stroke: 'stroke-level-expert',
    text: 'text-level-expert-text',
    border: 'border-level-expert',
    soft: 'bg-level-expert/15',
  },
};

/** Position of a domain level, 0 for novice up to 4 for expert. */
export function domainLevelIndex(level: DomainLevel): number {
  const index = DOMAIN_LEVELS.indexOf(level);
  return index < 0 ? 0 : index;
}

/** Clamp any value to a finite fraction in [0, 1]. */
export function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
