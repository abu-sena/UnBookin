import 'server-only';
import { eq, inArray, or } from 'drizzle-orm';
import { db } from '@/db';
import { domains, interests, profiles, sourceChunks, userInterests } from '@/db/schema';
import { ModuleContent } from '@/lib/engine/module-content';
import { buildSections } from './sections';
import { isUsable, lockOwnedPair, moduleChunks, moduleRows, moduleState, safely,
  type GenerationIdentity, type Transaction } from './internal';

async function personalization(tx: Transaction, userId: string, interestId: string) {
  const [profile] = await tx.select({ jobRole: profiles.jobRole, goal: profiles.goal,
    experienceLevel: profiles.experienceLevel }).from(profiles).where(eq(profiles.userId, userId));
  const [interest] = await tx.select({ name: interests.name }).from(interests)
    .where(eq(interests.id, interestId));
  return { profile: profile ?? { jobRole: null, goal: null, experienceLevel: 'novice' as const },
    interestName: interest?.name ?? null };
}

export async function allowedInterests(tx: Transaction, userId: string) {
  const owned = await tx.select().from(userInterests).where(eq(userInterests.userId, userId));
  const rows = await tx.select().from(interests).where(or(eq(interests.slug, 'general'),
    inArray(interests.id, owned.map((row) => row.interestId))));
  const result = [];
  for (const interest of rows.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))) {
    const children = interest.slug === 'general' ? [] : await tx.select().from(domains)
      .where(eq(domains.interestId, interest.id));
    result.push({ id: interest.id, slug: interest.slug, name: interest.name,
      domains: children.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
        .map(({ id, slug, name }) => ({ id, slug, name })) });
  }
  return result;
}

/** Private prompt data only: callers must never return these values from durable steps. */
export function loadOutlineInput(ids: GenerationIdentity) {
  return safely(() => db.transaction(async (tx) => {
    const pair = await lockOwnedPair(tx, ids);
    if (!isUsable(pair)) return null;
    const chunks = await tx.select().from(sourceChunks).where(eq(sourceChunks.sourceId, ids.sourceId));
    return { sections: buildSections(chunks),
      ...await personalization(tx, ids.userId, pair.unbook.interestId) };
  }));
}

export function listModuleWork(ids: GenerationIdentity) {
  return safely(() => db.transaction(async (tx) => {
    if (!isUsable(await lockOwnedPair(tx, ids))) return null;
    const result = [];
    for (const row of await moduleRows(tx, ids.unbookId)) {
      const { moduleId, sortOrder, hasContent, hasQuiz, hasCards } = await moduleState(tx, row);
      result.push({ moduleId, sortOrder, hasContent, hasQuiz, hasCards });
    }
    return result;
  }));
}

export function loadModuleInput(ids: GenerationIdentity, moduleId: string) {
  return safely(() => db.transaction(async (tx) => {
    const pair = await lockOwnedPair(tx, ids);
    if (!isUsable(pair)) return null;
    const row = (await moduleRows(tx, ids.unbookId)).find((row) => row.id === moduleId);
    if (!row) return null;
    const chunks = await moduleChunks(tx, ids.sourceId, row);
    const content = ModuleContent.safeParse(row.content);
    return {
      module: { sortOrder: row.sortOrder, title: row.title, summary: row.summary,
        pageFrom: row.sourcePageFrom, pageTo: row.sourcePageTo },
      chunks: chunks.map(({ id, pageFrom, pageTo, text }) => ({ id, pageFrom, pageTo, text })),
      ...await personalization(tx, ids.userId, pair.unbook.interestId),
      ...(content.success ? { summary: { bigIdea: content.data.bigIdea,
        practitioner: content.data.layers.practitioner } } : {}),
    };
  }));
}

export function loadTaggingInput(ids: GenerationIdentity) {
  return safely(() => db.transaction(async (tx) => {
    if (!isUsable(await lockOwnedPair(tx, ids))) return null;
    const rows = await moduleRows(tx, ids.unbookId);
    return { modules: rows.map((row, index) => ({ index, title: row.title, summary: row.summary })),
      interests: (await allowedInterests(tx, ids.userId)).map(({ slug, name, domains }) =>
        ({ slug, name, domains: domains.map(({ slug, name }) => ({ slug, name })) })) };
  }));
}
