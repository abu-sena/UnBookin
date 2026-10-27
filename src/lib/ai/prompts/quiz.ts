import { buildPrompt, quoteData, wrapSource, type ReviewPromptInput } from './shared';

export const PROMPT_VERSION = 'quiz@1';

export function buildQuizPrompt(input: ReviewPromptInput) {
  return buildPrompt(PROMPT_VERSION,
    'Create 6–8 distinct questions. Each has type, bloomLevel, prompt <=600, explanation <=600 and nonempty chunkRefs. ' +
    'bloomLevel is remember, understand, apply, analyze, evaluate or create. ' +
    'For n questions: remember+understand at least 1 and at most ceil(0.4*n); apply+analyze at least 2; evaluate+create at least 1. ' +
    'Aim for 30%/40%/30% respectively. ' +
    'mcq and case_mcq have 3–5 options and correct as one zero-based option index. ' +
    'multi_select has 4–6 options and correct as at least 2 unique zero-based option indexes. ' +
    'short_answer has modelAnswer and rubric as exactly four strings describing scores 1, 2, 3, 4 in order. ' +
    'All correct indexes must be within options. Use only supplied chunk IDs. No duplicate prompts. ' +
    'Use summaries as navigation, verify claims against chunks. Do not add direct quotations.',
    input.profile,
    `Module summary (quoted data): ${quoteData(input.summary)}\n${wrapSource(input.chunks)}`,
  );
}
