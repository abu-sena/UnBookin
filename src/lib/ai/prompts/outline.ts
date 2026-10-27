import { buildPrompt, quoteData, wrapSource, type LearningProfile } from './shared';

export const PROMPT_VERSION = 'outline@1';
export interface OutlineSection {
  id: string;
  title: string | null;
  pageFrom: number;
  pageTo: number;
  preview: string;
}
export interface OutlinePromptInput {
  profile: LearningProfile;
  sections: readonly OutlineSection[];
}

export function buildOutlinePrompt(input: OutlinePromptInput) {
  const sections = input.sections.map((section) => ({
    id: section.id,
    title: section.title?.startsWith('__section:') ? null : section.title,
    pageFrom: section.pageFrom,
    pageTo: section.pageTo,
  }));
  return buildPrompt(PROMPT_VERSION,
    'Create an outline: title <=120 characters, bigIdea <=220, and 3–12 modules. ' +
    'Each module has title <=90, summary <=300 and nonempty sectionIds. ' +
    'Use every supplied opaque section ID exactly once, preserving order in contiguous module groups. ' +
    'Source blocks here contain section previews; their chunk_id values are section IDs, not chunk citations. ' +
    'Use sectionIds as provenance; do not invent chunk IDs. A null title means an untitled section.',
    input.profile,
    `Ordered sections (quoted data): ${quoteData(sections)}\n${wrapSource(input.sections.map((s) => ({
      id: s.id, pageFrom: s.pageFrom, pageTo: s.pageTo, text: s.preview,
    })))}`,
  );
}
