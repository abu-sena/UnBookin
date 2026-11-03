import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { modules, unbooks } from '@/db/schema';
import { ModuleContent } from '@/lib/engine/module-content';
import { MentorError } from './errors';
import { assertMentorIdentity, type MentorIdentity } from './store';

/**
 * Cheap, instant, AI-free question suggestions. The server returns stable
 * message KEYS plus params; Indonesian copy lives in `messages/id.json`.
 */

export type MentorSuggestionKey =
  | 'summarizeModule'
  | 'explainConcept'
  | 'compareConcepts'
  | 'keyTakeaways'
  | 'applyToWork'
  | 'summarizeUnbook'
  | 'genericBigIdea'
  | 'genericExamples'
  | 'genericApply';

export type MentorSuggestion = {
  key: MentorSuggestionKey;
  params: Record<string, string>;
};

const GENERIC_SUGGESTIONS: MentorSuggestion[] = [
  { key: 'genericBigIdea', params: {} },
  { key: 'genericExamples', params: {} },
  { key: 'genericApply', params: {} },
];

type ModuleRow = { id: string; title: string; content: unknown };

function practitionerConcepts(content: unknown): string[] {
  if (!content || typeof content !== 'object') return [];
  if ((content as { pending?: unknown }).pending === true) return [];
  const parsed = ModuleContent.safeParse(content);
  if (!parsed.success) return [];
  return parsed.data.layers.practitioner
    .map((item) => item.concept.trim())
    .filter((concept) => concept.length > 0);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase('id');
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

/** Exactly three suggestions for the Unbook, optionally focused on one module. */
export async function getSuggestedQuestions(
  identity: MentorIdentity,
  unbookId: string,
  moduleId?: string,
): Promise<MentorSuggestion[]> {
  const { userId } = assertMentorIdentity(identity);
  const parsedUnbookId = z.uuid().safeParse(unbookId);
  if (!parsedUnbookId.success) throw new MentorError('invalidInput');
  if (moduleId !== undefined && !z.uuid().safeParse(moduleId).success) {
    throw new MentorError('invalidInput');
  }

  const [unbook] = await db
    .select({ id: unbooks.id, title: unbooks.title })
    .from(unbooks)
    .where(
      and(
        eq(unbooks.id, parsedUnbookId.data),
        eq(unbooks.userId, userId),
        eq(unbooks.status, 'ready'),
      ),
    )
    .limit(1);
  if (!unbook) throw new MentorError('notFound');

  const rows: ModuleRow[] = await db
    .select({ id: modules.id, title: modules.title, content: modules.content })
    .from(modules)
    .where(eq(modules.unbookId, unbook.id))
    .orderBy(asc(modules.sortOrder));

  let primary = rows[0];
  if (moduleId !== undefined) {
    primary = rows.find((row) => row.id === moduleId);
    if (!primary) throw new MentorError('notFound');
  }
  if (!primary) return GENERIC_SUGGESTIONS;

  const primaryConcepts = practitionerConcepts(primary.content);
  const otherConcepts = rows
    .filter((row) => row.id !== primary.id)
    .flatMap((row) => practitionerConcepts(row.content));
  const concepts = dedupe([...primaryConcepts, ...otherConcepts]);

  const suggestions: MentorSuggestion[] = [];
  const push = (suggestion: MentorSuggestion) => {
    if (suggestions.length < 3) suggestions.push(suggestion);
  };

  push({ key: 'summarizeModule', params: { module: primary.title } });
  if (concepts[0]) push({ key: 'explainConcept', params: { concept: concepts[0] } });
  if (concepts[0] && concepts[1]) {
    push({ key: 'compareConcepts', params: { first: concepts[0], second: concepts[1] } });
  }
  push({ key: 'keyTakeaways', params: { module: primary.title } });
  push({ key: 'applyToWork', params: { module: primary.title } });
  push({ key: 'summarizeUnbook', params: { unbook: unbook.title } });
  for (const generic of GENERIC_SUGGESTIONS) push(generic);

  return suggestions.slice(0, 3);
}
