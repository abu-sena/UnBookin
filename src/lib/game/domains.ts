/** E8-03: Dreyfus domain levels, gates and module XP allocation. */

export const DOMAIN_LEVELS = [
  'novice',
  'advanced_beginner',
  'competent',
  'proficient',
  'expert',
] as const;

export type DomainLevel = (typeof DOMAIN_LEVELS)[number];

export type DomainMetrics = {
  xp: number;
  passedQuizzes: number;
  verifiedActions: number;
};

export type DomainRequirement = {
  nextLevel: DomainLevel;
  xp: number;
  passedQuizzes: number;
  verifiedActions: number;
};

/**
 * Cumulative gates. A level is only reached when every lower gate is met too,
 * so each entry repeats the requirements it inherits.
 */
const DOMAIN_GATES: Record<DomainLevel, DomainMetrics> = {
  novice: { xp: 0, passedQuizzes: 0, verifiedActions: 0 },
  advanced_beginner: { xp: 150, passedQuizzes: 2, verifiedActions: 0 },
  competent: { xp: 500, passedQuizzes: 2, verifiedActions: 1 },
  proficient: { xp: 1_200, passedQuizzes: 2, verifiedActions: 3 },
  expert: { xp: 2_500, passedQuizzes: 2, verifiedActions: 6 },
};

function isDomainLevel(value: string): value is DomainLevel {
  return (DOMAIN_LEVELS as readonly string[]).includes(value);
}

function assertNonNegativeInteger(value: number, error: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(error);
  }
}

function assertMetrics({ xp, passedQuizzes, verifiedActions }: DomainMetrics): void {
  if (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0) {
    throw new Error('invalidDomainXp');
  }
  assertNonNegativeInteger(passedQuizzes, 'invalidPassedQuizzes');
  assertNonNegativeInteger(verifiedActions, 'invalidVerifiedActions');
}

/** Highest eligible level, checked top-down so all lower gates are implied. */
export function domainLevelFor(metrics: DomainMetrics): DomainLevel {
  assertMetrics(metrics);
  for (let index = DOMAIN_LEVELS.length - 1; index >= 0; index -= 1) {
    const level = DOMAIN_LEVELS[index]!;
    const gate = DOMAIN_GATES[level];
    if (
      metrics.xp >= gate.xp &&
      metrics.passedQuizzes >= gate.passedQuizzes &&
      metrics.verifiedActions >= gate.verifiedActions
    ) {
      return level;
    }
  }
  return 'novice';
}

/** Requirements for the next level, or `null` when already an expert. */
export function domainRequirements(level: DomainLevel): DomainRequirement | null {
  if (typeof level !== 'string' || !isDomainLevel(level)) {
    throw new Error('invalidDomainLevel');
  }
  const index = DOMAIN_LEVELS.indexOf(level);
  const nextLevel = DOMAIN_LEVELS[index + 1];
  if (nextLevel === undefined) return null;
  const gate = DOMAIN_GATES[nextLevel];
  return {
    nextLevel,
    xp: gate.xp,
    passedQuizzes: gate.passedQuizzes,
    verifiedActions: gate.verifiedActions,
  };
}

export type DomainConfidence = { domainId: string; confidence: number };
export type DomainAllocation = { domainId: string; amount: number };

type WeightEntry = { domainId: string; weight: number; index: number };

/**
 * Split an integer XP award across domains by confidence using largest
 * remainder. Duplicate ids are merged, non-positive/non-finite confidences are
 * ignored, and the result always sums to exactly `amount` when at least one
 * eligible domain exists.
 */
export function allocateDomainXp(
  amount: number,
  domains: readonly DomainConfidence[],
): DomainAllocation[] {
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    throw new Error('invalidXpAmount');
  }
  if (!Array.isArray(domains)) throw new Error('invalidDomains');

  const merged = new Map<string, WeightEntry>();
  for (const domain of domains) {
    if (!domain || typeof domain.domainId !== 'string' || domain.domainId.length === 0) continue;
    const { confidence } = domain;
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence <= 0) {
      continue;
    }
    const existing = merged.get(domain.domainId);
    if (existing) {
      existing.weight += confidence;
    } else {
      merged.set(domain.domainId, {
        domainId: domain.domainId,
        weight: confidence,
        index: merged.size,
      });
    }
  }

  const entries = [...merged.values()];
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (entries.length === 0 || totalWeight <= 0) return [];

  const base: { entry: WeightEntry; amount: number; remainder: number }[] = entries.map((entry) => {
    const exact = (amount * entry.weight) / totalWeight;
    const floored = Math.floor(exact);
    return { entry, amount: floored, remainder: exact - floored };
  });

  const allocated = base.reduce((sum, item) => sum + item.amount, 0);
  let leftover = amount - allocated;
  const order = [...base].sort(
    (a, b) => b.remainder - a.remainder || a.entry.index - b.entry.index,
  );
  for (const item of order) {
    if (leftover <= 0) break;
    item.amount += 1;
    leftover -= 1;
  }

  return base
    .filter((item) => item.amount > 0)
    .map((item) => ({ domainId: item.entry.domainId, amount: item.amount }));
}
