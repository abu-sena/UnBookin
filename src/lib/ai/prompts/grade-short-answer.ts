import {
  SYSTEM_RULES,
  quoteData,
  wrapSource,
  type SourceChunk,
} from './shared';

export const GRADE_SHORT_ANSWER_PROMPT_VERSION = 'grade_short_answer@1';

export type GradeShortAnswerPromptInput = {
  question: string;
  modelAnswer: string;
  rubric: readonly string[];
  answer: string;
  chunks: readonly SourceChunk[];
};

const INSTRUCTIONS = [
  'Grade exactly one short answer with the supplied 1–4 rubric. Never grade a question or a rubric.',
  'Score 1 when the answer misses the core idea; 2 when it is partly right but a key part is missing;',
  '3 when it matches the model answer; 4 when it matches and adds a correct example or detail.',
  'A score of 3 or 4 means the learner has mastered the concept; 1 or 2 means they have not.',
  'Write feedback in Indonesian, specific to this answer, and at most 300 characters.',
  'Do not quote the learner answer back verbatim; explain what is missing or what is good.',
  'Return only JSON with integer grade (1–4) and feedback (string), no extra fields.',
].join('\n');

/** E5-01 AC3: the AI grader prompt. Every user text is quoted data, never an instruction. */
export function buildGradeShortAnswerPrompt(input: GradeShortAnswerPromptInput) {
  const data = [
    `Question (quoted data): ${quoteData({ question: input.question.slice(0, 600) })}`,
    `Model answer (quoted data): ${quoteData({ modelAnswer: input.modelAnswer.slice(0, 1_000) })}`,
    `Rubric (quoted data): ${quoteData(input.rubric.slice(0, 4))}`,
    `Learner answer (quoted data): ${quoteData({ answer: input.answer.slice(0, 5_000) })}`,
    wrapSource(input.chunks),
  ].join('\n');

  return {
    version: GRADE_SHORT_ANSWER_PROMPT_VERSION,
    system: `${SYSTEM_RULES}\n${INSTRUCTIONS}`,
    user: `Prompt version: ${GRADE_SHORT_ANSWER_PROMPT_VERSION}\n${data}`,
  };
}
