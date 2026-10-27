import { buildPrompt, quoteData, wrapSource, type ReviewPromptInput } from './shared';

export const PROMPT_VERSION = 'cards@1';

export function buildCardsPrompt(input: ReviewPromptInput) {
  return buildPrompt(PROMPT_VERSION,
    'Create 5–8 review cards, each with front <=200 characters, back <=400 and chunkRef as a supplied chunk UUID. ' +
    'Use distinct fronts and concise recall/application questions. ' +
    'Use summaries as navigation, verify claims against chunks. Do not add direct quotations.',
    input.profile,
    `Module summary (quoted data): ${quoteData(input.summary)}\n${wrapSource(input.chunks)}`,
  );
}
