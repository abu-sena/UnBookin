import 'server-only';
import { buildCardsPrompt } from '@/lib/ai/prompts/cards';
import { buildModulePrompt } from '@/lib/ai/prompts/module';
import { buildOutlinePrompt } from '@/lib/ai/prompts/outline';
import { buildQuizPrompt } from '@/lib/ai/prompts/quiz';
import { buildTaggingPrompt } from '@/lib/ai/prompts/tagging';
import type { LearningProfile } from '@/lib/ai/prompts/shared';
import { runStructuredTask } from '@/lib/ai/structured';
import {
  CardsResult,
  ModuleResult,
  OutlineResult,
  QuizResult,
  TaggingResult,
} from '@/lib/engine/generation/schemas';
import {
  validateCards,
  validateModule,
  validateOutline,
  validateQuiz,
  validateTagging,
} from '@/lib/engine/generation/validate';
import { loadModuleInput, loadOutlineInput, loadTaggingInput } from '@/lib/generation/context';
import type { GenerationIdentity } from '@/lib/generation/internal';
import {
  finalizeGeneration,
  persistCards,
  persistModuleContent,
  persistOutline,
  persistQuiz,
  persistTagging,
} from '@/lib/generation/store';

export type { GenerationIdentity };
export type OutlineStepResult = { moduleCount: number } | { skipped: true };
export type PersistStepResult = { stored: boolean } | { skipped: true };
export type TaggingStepResult = { tagged: true } | { skipped: true };
export type FinalizeStepResult = { charged: boolean };

const MAX_PAGE = Number.MAX_SAFE_INTEGER;

type ProfileInput = {
  profile: { jobRole: string | null; goal: string | null; experienceLevel: string | null };
  interestName?: string | null;
};

function learningProfile(input: ProfileInput): LearningProfile {
  return {
    jobRole: input.profile.jobRole ?? '',
    goal: input.profile.goal ?? '',
    experienceLevel: input.profile.experienceLevel ?? 'novice',
    interest: input.interestName ?? 'general',
  };
}

/** Prompt builders require non-null pages; sections without pages span nothing citable. */
function toPromptChunks(chunks: readonly { id: string; pageFrom: number | null; pageTo: number | null; text: string }[]) {
  return chunks.map((chunk) => ({
    id: chunk.id,
    pageFrom: chunk.pageFrom ?? 1,
    pageTo: chunk.pageTo ?? chunk.pageFrom ?? 1,
    text: chunk.text,
  }));
}

export async function runOutlineStep(ids: GenerationIdentity): Promise<OutlineStepResult> {
  const input = await loadOutlineInput(ids);
  if (!input) return { skipped: true };
  const sections = input.sections.map((section) => ({
    id: section.id,
    title: section.title,
    pageFrom: section.pageFrom ?? section.pageTo ?? 1,
    pageTo: section.pageTo ?? section.pageFrom ?? 1,
    preview: section.preview,
  }));
  const prompt = buildOutlinePrompt({ profile: learningProfile(input), sections });
  const result = await runStructuredTask({
    task: 'outline',
    schema: OutlineResult,
    prompt,
    userId: ids.userId,
    validate: (data) => validateOutline(data, sections.map((section) => section.id)),
  });
  const { moduleCount } = await persistOutline(ids, result.data, input.sections, result.costUsd);
  return { moduleCount };
}

export async function runModuleContentStep(
  ids: GenerationIdentity,
  moduleId: string,
): Promise<PersistStepResult> {
  const input = await loadModuleInput(ids, moduleId);
  if (!input) return { skipped: true };
  const prompt = buildModulePrompt({
    profile: learningProfile(input),
    title: input.module.title,
    summary: input.module.summary ?? '',
    chunks: toPromptChunks(input.chunks),
  });
  const allowed = input.chunks.map((chunk) => chunk.id);
  const pageFrom = input.module.pageFrom ?? 1;
  const pageTo = input.module.pageTo ?? MAX_PAGE;
  const result = await runStructuredTask({
    task: 'module',
    schema: ModuleResult,
    prompt,
    userId: ids.userId,
    validate: (data) => validateModule(data, allowed, { pageFrom, pageTo }),
  });
  const { stored } = await persistModuleContent(ids, moduleId, result.data, result.costUsd);
  return { stored };
}

export async function runQuizStep(
  ids: GenerationIdentity,
  moduleId: string,
): Promise<PersistStepResult> {
  const input = await loadModuleInput(ids, moduleId);
  if (!input?.summary) return { skipped: true };
  const prompt = buildQuizPrompt({
    profile: learningProfile(input),
    summary: input.summary,
    chunks: toPromptChunks(input.chunks),
  });
  const result = await runStructuredTask({
    task: 'quiz',
    schema: QuizResult,
    prompt,
    userId: ids.userId,
    validate: (data) => validateQuiz(data, input.chunks.map((chunk) => chunk.id)),
  });
  const { stored } = await persistQuiz(ids, moduleId, result.data, result.costUsd);
  return { stored };
}

export async function runCardsStep(
  ids: GenerationIdentity,
  moduleId: string,
): Promise<PersistStepResult> {
  const input = await loadModuleInput(ids, moduleId);
  if (!input?.summary) return { skipped: true };
  const prompt = buildCardsPrompt({
    profile: learningProfile(input),
    summary: input.summary,
    chunks: toPromptChunks(input.chunks),
  });
  const result = await runStructuredTask({
    task: 'cards',
    schema: CardsResult,
    prompt,
    userId: ids.userId,
    validate: (data) => validateCards(data, input.chunks.map((chunk) => chunk.id)),
  });
  const { stored } = await persistCards(ids, moduleId, result.data, result.costUsd);
  return { stored };
}

export async function runTaggingStep(ids: GenerationIdentity): Promise<TaggingStepResult> {
  const input = await loadTaggingInput(ids);
  if (!input) return { skipped: true };
  const prompt = buildTaggingPrompt({
    profile: { jobRole: '', goal: '', experienceLevel: 'novice', interest: 'general' },
    modules: input.modules.map((module) => ({
      title: module.title,
      summary: module.summary ?? '',
    })),
    interests: input.interests,
  });
  const allowedDomainSlugsByInterest: Record<string, string[]> = Object.fromEntries(
    input.interests.map((interest) => [interest.slug, interest.domains.map((domain) => domain.slug)]),
  );
  const result = await runStructuredTask({
    task: 'tagging',
    schema: TaggingResult,
    prompt,
    userId: ids.userId,
    validate: (data) =>
      validateTagging(data, {
        moduleCount: input.modules.length,
        allowedInterestSlugs: input.interests.map((interest) => interest.slug),
        allowedDomainSlugsByInterest,
      }),
  });
  await persistTagging(ids, result.data);
  return { tagged: true };
}

export async function runFinalizeStep(ids: GenerationIdentity): Promise<FinalizeStepResult> {
  const { charged } = await finalizeGeneration(ids);
  return { charged };
}
