import 'server-only';
import { and, asc, desc, eq, ilike, inArray, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { interests, moduleProgress, modules, sources, unbooks } from '@/db/schema';
import { requireUser } from '@/lib/auth/session';
import { aggregateModuleProgress, type ModuleProgressSummary } from './progress';
import { buildTitlePattern } from './search-params';
import type { LibraryData, LibraryFilters, LibraryInterestOption, LibraryItem } from './types';

/** Only the query surface is needed, which keeps the tenant tests dependency-free. */
export type LibraryDatabase = Pick<typeof db, 'select'>;

/**
 * E2-03: the signed-in user's personal library. The user id comes only from the
 * server session; public Originals (no owner) are excluded by the ownership
 * predicate. Every joined table that carries a user id repeats that predicate.
 */
export async function getMyLibrary(
  filters: LibraryFilters,
  database: LibraryDatabase = db,
): Promise<LibraryData> {
  const user = await requireUser('/library');
  return loadMyLibrary(database, user.id, filters);
}

async function loadMyLibrary(
  database: LibraryDatabase,
  userId: string,
  filters: LibraryFilters,
): Promise<LibraryData> {
  // Filter options come from the user's own Unbooks, never from the interests
  // table directly, so another user's choices can never be inferred.
  const interestRows = await database
    .select({ slug: interests.slug, name: interests.name })
    .from(unbooks)
    .innerJoin(interests, eq(unbooks.interestId, interests.id))
    .where(eq(unbooks.userId, userId))
    .groupBy(interests.slug, interests.name)
    .orderBy(asc(interests.name));

  const availableInterests: LibraryInterestOption[] = interestRows;
  const interest = availableInterests.some((option) => option.slug === filters.interest)
    ? filters.interest
    : '';
  const normalizedFilters: LibraryFilters = { ...filters, interest };

  const conditions: SQL<unknown>[] = [eq(unbooks.userId, userId)];
  const titlePattern = buildTitlePattern(normalizedFilters.q);
  if (titlePattern) conditions.push(ilike(unbooks.title, titlePattern));
  if (normalizedFilters.interest) conditions.push(eq(interests.slug, normalizedFilters.interest));
  if (normalizedFilters.status) conditions.push(eq(unbooks.status, normalizedFilters.status));

  const unbookRows = await database
    .select({
      id: unbooks.id,
      title: unbooks.title,
      author: sources.author,
      interestName: interests.name,
      interestSlug: interests.slug,
      status: unbooks.status,
    })
    .from(unbooks)
    .innerJoin(interests, eq(unbooks.interestId, interests.id))
    // LEFT JOIN: a missing/deleted source must not hide the Unbook. The owner
    // predicate also stops an Unbook from showing another user's source data.
    .leftJoin(sources, and(eq(unbooks.sourceId, sources.id), eq(sources.userId, userId)))
    .where(and(...conditions))
    .orderBy(desc(unbooks.createdAt), asc(unbooks.id));

  const progressByUnbook: Map<string, ModuleProgressSummary> =
    unbookRows.length === 0
      ? new Map()
      : await loadModuleProgress(
          database,
          userId,
          unbookRows.map((row) => row.id),
        );

  const items: LibraryItem[] = unbookRows.map((row) => {
    const progress = progressByUnbook.get(row.id);
    return {
      id: row.id,
      title: row.title,
      author: row.author ?? null,
      interestName: row.interestName,
      interestSlug: row.interestSlug,
      status: row.status,
      modulesRead: progress?.modulesRead ?? 0,
      moduleCount: progress?.moduleCount ?? 0,
    };
  });

  return {
    items,
    interests: availableInterests,
    filters: normalizedFilters,
    hasAnyUnbooks: availableInterests.length > 0,
  };
}

async function loadModuleProgress(database: LibraryDatabase, userId: string, unbookIds: string[]) {
  const rows = await database
    .select({
      unbookId: modules.unbookId,
      moduleId: modules.id,
      progressStatus: moduleProgress.status,
    })
    .from(modules)
    .innerJoin(unbooks, eq(modules.unbookId, unbooks.id))
    .leftJoin(
      moduleProgress,
      and(eq(moduleProgress.moduleId, modules.id), eq(moduleProgress.userId, userId)),
    )
    .where(and(eq(unbooks.userId, userId), inArray(modules.unbookId, unbookIds)));

  return aggregateModuleProgress(rows);
}
