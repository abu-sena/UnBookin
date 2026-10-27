import { buildPrompt, quoteData, wrapSource, type LearningProfile, type SourceChunk } from './shared';

export const PROMPT_VERSION = 'module@1';
export interface ModulePromptInput {
  profile: LearningProfile;
  title: string;
  summary: string;
  chunks: readonly SourceChunk[];
}

export function buildModulePrompt(input: ModulePromptInput) {
  return buildPrompt(PROMPT_VERSION,
    'Create title <=90, summary <=300 and content matching ModuleContent. ' +
    'Include bigIdea <=220, whyItMatters <=400; layers: eli5 (80–150 words), practitioner (3–7 concepts, ' +
    'each with concept, explanation and nonempty chunkRefs), expert (assumptions, evidence, critiques, compareWith). ' +
    'Include conceptMap nodes (unique id, label, kind core/concept/example; at most 20, exactly one core) ' +
    'and edges (from, to, optional label) using existing nodes only. ' +
    'Include application: caseStudy (title, situation, howToApply), tools (name, type checklist/template/questions/canvas, items), ' +
    'actionThisWeek (title <=90, at most 4 steps, doneWhen), commonMistakes (at most 5). ' +
    'Set estimatedMinutes to an integer 3–25. Optional keyQuote has text <=200 and page within supplied chunk pages. ' +
    'Every practitioner concept must cite only supplied chunk IDs. Omit keyQuote unless quoting directly.',
    input.profile,
    `Module plan (quoted data): ${quoteData({ title: input.title, summary: input.summary })}\n${wrapSource(input.chunks)}`,
  );
}
