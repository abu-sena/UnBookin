import { z } from 'zod';

export const waitlistSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  interestSlug: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => value !== 'general'),
  ref: z
    .string()
    .regex(/^[A-Za-z0-9]{6,12}$/)
    .optional(),
  utm: z.string().max(300).optional(),
  website: z.string().optional(),
});

export type WaitlistState =
  | { status: 'success'; position: number; referralCode: string }
  | {
      status: 'error';
      messageKey: 'invalidInput' | 'invalidInterest' | 'duplicateEmail' | 'generic';
    }
  | { status: 'idle' };
