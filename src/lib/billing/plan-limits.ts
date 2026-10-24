import { z } from 'zod';

export const PlanLimits = z.object({
  unbooksPerMonth: z.number().int().nonnegative().nullable(),
  unbooksFairUse: z.number().int().nonnegative(),
  maxPagesPerSource: z.number().int().positive(),
  maxFileMb: z.number().int().positive(),
  mentorMessagesPerMonth: z.number().int().nonnegative().nullable(),
  originalsAccess: z.enum(['sample', 'full']),
  modelTier: z.enum(['economy', 'main', 'byok']),
});
export type PlanLimits = z.infer<typeof PlanLimits>;
