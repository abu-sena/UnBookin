import { z } from 'zod';

/**
 * Persisted checklist state for a module: tool index (as a string key) to the
 * indexes of the checked items. Nullable in `module_progress.checklist`.
 */
export const checklistStateSchema = z.record(
  z.string().regex(/^(0|[1-9]\d{0,2})$/, 'Expected a non-negative tool index'),
  z
    .array(z.number().int().min(0).max(200))
    .max(200)
    .refine((indices) => new Set(indices).size === indices.length, 'Duplicate item index'),
);
export type ChecklistState = z.infer<typeof checklistStateSchema>;

export const contentLayerSchema = z.enum(['eli5', 'practitioner', 'expert']);
export type ContentLayer = z.infer<typeof contentLayerSchema>;

export const reviewResultSchema = z.enum(['again', 'hard', 'good']);
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const unbookIdSchema = z.uuid();
export const moduleIdSchema = z.uuid();
export const quizIdSchema = z.uuid();
export const attemptIdSchema = z.uuid();
export const questionIdSchema = z.uuid();
export const cardIdSchema = z.uuid();
export const chunkIdSchema = z.uuid();

export const moduleRefSchema = z.strictObject({ moduleId: moduleIdSchema });
export const quizRefSchema = z.strictObject({ quizId: quizIdSchema });

export const checkedIndicesSchema = z
  .array(z.number().int().min(0).max(200))
  .max(200)
  .refine((indices) => new Set(indices).size === indices.length, 'Duplicate item index');

export const saveChecklistInputSchema = z.strictObject({
  moduleId: moduleIdSchema,
  toolIndex: z.number().int().min(0).max(99),
  checkedIndices: checkedIndicesSchema,
});
export type SaveChecklistInput = z.infer<typeof saveChecklistInputSchema>;

export const singleChoiceAnswerSchema = z.number().int().min(0).max(20);
export const multiSelectAnswerSchema = z
  .array(z.number().int().min(0).max(20))
  .max(20)
  .refine((indices) => new Set(indices).size === indices.length, 'Duplicate option index');
export const shortAnswerTextSchema = z.string().trim().min(1).max(5_000);

export const shortAnswerGradeSchema = z.union([
  z.strictObject({ grade: z.number().int().min(1).max(4) }),
  z.strictObject({ selfGraded: z.literal(true), correct: z.boolean() }),
]);
export type ShortAnswerGrade = z.infer<typeof shortAnswerGradeSchema>;
