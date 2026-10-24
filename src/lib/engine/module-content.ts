import { z } from 'zod';

export const ModuleContent = z.object({
  bigIdea: z.string().max(220),
  whyItMatters: z.string().max(400),
  layers: z.object({
    eli5: z.string(),
    practitioner: z.array(
      z.object({ concept: z.string(), explanation: z.string(), chunkRefs: z.array(z.uuid()) }),
    ),
    expert: z.object({
      assumptions: z.array(z.string()),
      evidence: z.array(z.string()),
      critiques: z.array(z.string()),
      compareWith: z.array(z.string()),
    }),
  }),
  conceptMap: z.object({
    nodes: z.array(
      z.object({ id: z.string(), label: z.string(), kind: z.enum(['core', 'concept', 'example']) }),
    ),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
  }),
  application: z.object({
    caseStudy: z.object({
      title: z.string(),
      situation: z.string(),
      howToApply: z.array(z.string()),
    }),
    tools: z.array(
      z.object({
        name: z.string(),
        type: z.enum(['checklist', 'template', 'questions', 'canvas']),
        items: z.array(z.string()),
      }),
    ),
    actionThisWeek: z.object({
      title: z.string().max(90),
      steps: z.array(z.string()).max(4),
      doneWhen: z.string(),
    }),
    commonMistakes: z.array(z.string()).max(5),
  }),
  keyQuote: z.object({ text: z.string().max(200), page: z.number().int() }).optional(),
  estimatedMinutes: z.number().int().min(3).max(25),
});
export type ModuleContent = z.infer<typeof ModuleContent>;
