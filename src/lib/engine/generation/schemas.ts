import { z } from 'zod';

import { ModuleContent } from '../module-content';

export const GENERATION_TASKS = ['outline', 'module', 'quiz', 'cards', 'tagging'] as const;
export type GenerationTask = (typeof GENERATION_TASKS)[number];

export const OutlineModule = z.object({
  title: z.string().max(90),
  summary: z.string().max(300),
  sectionIds: z.array(z.string()).min(1),
}).strict();
export type OutlineModule = z.infer<typeof OutlineModule>;

export const OutlineResult = z.object({
  title: z.string().max(120),
  bigIdea: z.string().max(220),
  modules: z.array(OutlineModule).min(3).max(12),
}).strict();
export type OutlineResult = z.infer<typeof OutlineResult>;

export const ModuleResult = z.object({
  title: z.string().max(90),
  summary: z.string().max(300),
  content: ModuleContent,
}).strict();
export type ModuleResult = z.infer<typeof ModuleResult>;

const questionFields = {
  bloomLevel: z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']),
  prompt: z.string().max(600),
  explanation: z.string().max(600),
  chunkRefs: z.array(z.uuid()).min(1),
};
const singleChoiceFields = {
  ...questionFields,
  options: z.array(z.string()).min(3).max(5),
  correct: z.number().int().min(0),
};
export const QuizQuestion = z.discriminatedUnion('type', [
  z.object({ ...singleChoiceFields, type: z.literal('mcq') }).strict(),
  z.object({ ...singleChoiceFields, type: z.literal('case_mcq') }).strict(),
  z.object({
    ...questionFields,
    type: z.literal('multi_select'),
    options: z.array(z.string()).min(4).max(6),
    correct: z.array(z.number().int().min(0)).min(2)
      .refine((indexes) => new Set(indexes).size === indexes.length, 'Indexes must be unique'),
  }).strict(),
  z.object({
    ...questionFields,
    type: z.literal('short_answer'),
    modelAnswer: z.string(),
    rubric: z.array(z.string()).length(4),
  }).strict(),
]);
export type QuizQuestion = z.infer<typeof QuizQuestion>;
export const QuizResult = z.object({ questions: z.array(QuizQuestion).min(6).max(8) }).strict();
export type QuizResult = z.infer<typeof QuizResult>;

export const CardsResult = z.object({
  cards: z.array(z.object({
    front: z.string().max(200),
    back: z.string().max(400),
    chunkRef: z.uuid(),
  }).strict()).min(5).max(8),
}).strict();
export type CardsResult = z.infer<typeof CardsResult>;

export const TaggingResult = z.object({
  interestSlug: z.string(),
  modules: z.array(z.object({
    moduleIndex: z.number().int().min(0),
    domains: z.array(z.object({
      domainSlug: z.string(),
      confidence: z.number().min(0).max(1),
    }).strict()).max(3),
  }).strict()),
}).strict();
export type TaggingResult = z.infer<typeof TaggingResult>;
