import { z } from 'zod';

/** E5-01 AC3: strict AI output for `grade_short_answer` (rubric 1–4). */
export const GradeShortAnswerResult = z
  .strictObject({
    grade: z.number().int().min(1).max(4),
    feedback: z.string().trim().min(1).max(300),
  });

export type GradeShortAnswerResult = z.infer<typeof GradeShortAnswerResult>;
