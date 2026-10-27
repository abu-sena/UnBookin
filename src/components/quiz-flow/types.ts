export type QuizQuestionView = {
  id: string;
  type: 'mcq' | 'multi_select' | 'case_mcq' | 'short_answer';
  prompt: string;
  options: unknown;
};

export type QuizConcept = {
  concept: string;
  chunkRefs: string[];
};

export type QuizNextModule = {
  moduleId: string;
  title: string;
} | null;

export type QuizFlowProps = {
  unbookId: string;
  moduleId: string;
  moduleTitle: string;
  quizId: string;
  questions: QuizQuestionView[];
  concepts: QuizConcept[];
  nextModule: QuizNextModule;
};

export type AnswerInput = { index: number } | { indexes: number[] } | { text: string };

export function questionOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options.filter((option): option is string => typeof option === 'string');
}
