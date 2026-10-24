import { z } from 'zod';

export const BadgeRule = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('count'),
    metric: z.enum([
      'unbooks_completed',
      'modules_read',
      'actions_verified',
      'cards_reviewed',
      'interests_joined',
    ]),
    gte: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('streak'), gte: z.number().int().positive() }),
  z.object({ kind: z.literal('quiz_perfect') }),
]);
export type BadgeRule = z.infer<typeof BadgeRule>;
