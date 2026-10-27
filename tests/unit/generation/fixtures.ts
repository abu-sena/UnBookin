import type { CardsResult, ModuleResult, OutlineResult, QuizQuestion, QuizResult } from '@/lib/engine/generation/schemas';

export const chunkId = '00000000-0000-4000-8000-000000000001';
export const otherChunkId = '00000000-0000-4000-8000-000000000002';
export const outline: OutlineResult = {
  title: 'Outline', bigIdea: 'Idea',
  modules: ['s1', 's2', 's3'].map((id) => ({ title: id, summary: 'Summary', sectionIds: [id] })),
};
export const moduleResult: ModuleResult = {
  title: 'Module', summary: 'Summary',
  content: {
    bigIdea: 'Idea', whyItMatters: 'Relevance',
    layers: {
      eli5: 'Analogy',
      practitioner: [{ concept: 'Concept', explanation: 'Explanation', chunkRefs: [chunkId] }],
      expert: { assumptions: [], evidence: [], critiques: [], compareWith: [] },
    },
    conceptMap: {
      nodes: [{ id: 'core', label: 'Idea', kind: 'core' }, { id: 'detail', label: 'Detail', kind: 'concept' }],
      edges: [{ from: 'core', to: 'detail' }],
    },
    application: {
      caseStudy: { title: 'Case', situation: 'Situation', howToApply: [] },
      tools: [], actionThisWeek: { title: 'Action', steps: [], doneWhen: 'Done' }, commonMistakes: [],
    },
    keyQuote: { text: 'Quote', page: 2 }, estimatedMinutes: 5,
  },
};
export function question(index: number, bloomLevel: QuizQuestion['bloomLevel'] = 'apply'): QuizQuestion {
  return { type: 'mcq', bloomLevel, prompt: `Question ${index}`, explanation: 'Explanation',
    chunkRefs: [chunkId], options: ['A', 'B', 'C'], correct: 0 };
}
export function quiz(levels: QuizQuestion['bloomLevel'][] = [
  'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create',
]): QuizResult {
  return { questions: levels.map((level, index) => question(index, level)) };
}
export const cards: CardsResult = {
  cards: Array.from({ length: 5 }, (_, index) => ({ front: `Front ${index}`, back: 'Back', chunkRef: chunkId })),
};
export const tagging = { interestSlug: 'learning', modules: [
  { moduleIndex: 0, domains: [{ domainSlug: 'focus', confidence: 0.8 }] },
] };
export const taggingContext = {
  moduleCount: 1, allowedInterestSlugs: ['general', 'learning'],
  allowedDomainSlugsByInterest: { learning: ['focus'], general: [] },
};
