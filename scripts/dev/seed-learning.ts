#!/usr/bin/env node
/**
 * Local E2E fixture for Alur A. Creates a throwaway learner, an onboarded
 * profile, a session, and a ready Unbook generated through the real step
 * services with the in-process fake OpenRouter provider from eval-engine.
 * Refuses any database that is not a local host.
 *
 * Usage: pnpm dev:seed-learning [--cleanup]
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import {
  ENGINE_FIXTURES,
  isProductionDatabaseUrl,
  requireDatabaseUrl,
  startFakeProvider,
  withFakeAiTaskConfigs,
} from '../eval-engine';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = join(HERE, '..', '..', 'tests', 'e2e', '.auth', 'learning.json');
const FIXTURE = ENGINE_FIXTURES.find((fixture) => fixture.name === 'leadership');

export type LearningSeed = {
  runId: string;
  userId: string;
  sessionToken: string;
  unbookId: string;
  moduleIds: string[];
  quizIds: string[];
};

type Db = typeof import('@/db').db;

function runSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emailFor(runId: string): string {
  return `e2e-learning-${runId}@example.test`;
}

function interestSlug(runId: string): string {
  return `e2e-${runId}`;
}

function assertLocalDatabase(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing to seed: DATABASE_URL host "${host}" is not local.`);
  }
  if (isProductionDatabaseUrl(url)) {
    throw new Error('Refusing to seed: DATABASE_URL looks like a Neon/Vercel production host.');
  }
  return url;
}

function persistedChapterTitle(chunk: {
  chapterTitle: string | null;
  sectionIndex?: number;
}): string | null {
  if (chunk.chapterTitle !== null) return chunk.chapterTitle;
  return chunk.sectionIndex === undefined ? null : `__section:${chunk.sectionIndex}`;
}

async function createLearner(db: Db, runId: string): Promise<{ userId: string; sessionToken: string }> {
  const schema = await import('@/db/schema');
  const [user] = await db
    .insert(schema.users)
    .values({ name: 'E2E Learner', email: emailFor(runId) })
    .returning({ id: schema.users.id });
  if (!user) throw new Error('Could not create the throwaway learner.');

  await db.insert(schema.profiles).values({
    userId: user.id,
    displayName: 'E2E Learner',
    jobRole: 'Knowledge worker',
    goal: 'Apply one idea this week',
    experienceLevel: 'intermediate',
    timezone: 'Asia/Jakarta',
    onboardedAt: new Date(),
  });
  await db.insert(schema.notificationPrefs).values({ userId: user.id });

  const sessionToken = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({ sessionToken, userId: user.id, expires });
  return { userId: user.id, sessionToken };
}

async function createInterest(db: Db, runId: string, userId: string): Promise<string> {
  const schema = await import('@/db/schema');
  const [interest] = await db
    .insert(schema.interests)
    .values({
      slug: interestSlug(runId),
      name: 'Latihan E2E',
      description: 'Temporary interest created by pnpm dev:seed-learning.',
      colorToken: 'chart-1',
      sortOrder: 0,
    })
    .returning({ id: schema.interests.id });
  if (!interest) throw new Error('Could not create the throwaway interest.');
  await db.insert(schema.domains).values([
    { interestId: interest.id, slug: 'practice', name: 'Praktik', sortOrder: 0 },
    { interestId: interest.id, slug: 'review', name: 'Tinjauan', sortOrder: 1 },
  ]);
  await db.insert(schema.userInterests).values({
    userId,
    interestId: interest.id,
    isPrimary: true,
  });
  return interest.id;
}

function fixtureFile(file: string): string {
  return join(HERE, '..', '..', 'tests', 'fixtures', 'engine', file);
}

async function seedUnbook(
  db: Db,
  context: { userId: string; interestId: string },
): Promise<{ unbookId: string; moduleIds: string[]; quizIds: string[] }> {
  if (!FIXTURE) throw new Error('The leadership fixture is missing.');
  const schema = await import('@/db/schema');
  const { ModuleContent } = await import('@/lib/engine/module-content');
  const { extractSource } = await import('@/lib/ingest/extract');
  const { chunkSource } = await import('@/lib/ingest/chunk');
  const steps = await import('@/lib/generation/steps');
  const store = await import('@/lib/generation/store');
  const generationContext = await import('@/lib/generation/context');

  const bytes = await readFile(fixtureFile(FIXTURE.file));
  const extracted = await extractSource({
    type: FIXTURE.kind,
    bytes: new Uint8Array(bytes),
    maxPages: 500,
    maxBytes: 20 * 1024 * 1024,
  });
  const chunks = chunkSource(extracted.pages);
  if (chunks.length < 3) throw new Error('Fixture produced fewer than 3 chunks.');
  let markers: (string | null)[] = chunks.map(persistedChapterTitle);
  if (new Set(markers).size < 3) markers = chunks.map((_chunk, index) => `__section:${index + 1}`);

  const [source] = await db
    .insert(schema.sources)
    .values({
      userId: context.userId,
      type: FIXTURE.kind,
      title: FIXTURE.title,
      status: 'ready',
      rightsConfirmedAt: new Date(),
      pageCount: extracted.pageCount,
      wordCount: extracted.wordCount,
      sizeBytes: bytes.byteLength,
      language: 'en',
    })
    .returning({ id: schema.sources.id });
  if (!source) throw new Error('Could not insert the fixture source.');
  await db.insert(schema.sourceChunks).values(
    chunks.map((chunk, index) => ({
      sourceId: source.id,
      idx: chunk.idx,
      chapterTitle: markers[index] ?? null,
      pageFrom: chunk.pageFrom,
      pageTo: chunk.pageTo,
      text: chunk.text,
      tokenCount: chunk.tokenCount,
    })),
  );
  const [unbook] = await db
    .insert(schema.unbooks)
    .values({
      userId: context.userId,
      sourceId: source.id,
      title: FIXTURE.title,
      interestId: context.interestId,
      status: 'queued',
    })
    .returning({ id: schema.unbooks.id });
  if (!unbook) throw new Error('Could not insert the fixture Unbook.');

  const ids = { userId: context.userId, sourceId: source.id, unbookId: unbook.id };
  const start = await store.startOutline(ids);
  if (start.state === 'skip') throw new Error('Unbook became unusable before outline.');
  if (start.state === 'outline') await steps.runOutlineStep(ids);
  const work = await generationContext.listModuleWork(ids);
  if (!work) throw new Error('Could not list module work.');
  for (let index = 0; index < work.length; index += 3) {
    await Promise.all(
      work.slice(index, index + 3).map(async (module) => {
        if (!module.hasContent) await steps.runModuleContentStep(ids, module.moduleId);
        if (!module.hasQuiz) await steps.runQuizStep(ids, module.moduleId);
        if (!module.hasCards) await steps.runCardsStep(ids, module.moduleId);
      }),
    );
  }
  await steps.runTaggingStep(ids);
  await steps.runFinalizeStep(ids);

  const moduleRows = await db
    .select()
    .from(schema.modules)
    .where(eq(schema.modules.unbookId, unbook.id));
  moduleRows.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  if (moduleRows.length < 3) throw new Error('Generated Unbook has fewer than 3 modules.');
  const sourceChunkIds = new Set(
    (
      await db
        .select({ id: schema.sourceChunks.id })
        .from(schema.sourceChunks)
        .where(eq(schema.sourceChunks.sourceId, source.id))
    ).map((chunk) => chunk.id),
  );

  const quizIds: string[] = [];
  for (const moduleRow of moduleRows) {
    if (!ModuleContent.safeParse(moduleRow.content).success) {
      throw new Error(`Module ${moduleRow.sortOrder + 1} content does not parse.`);
    }
    const [quiz] = await db
      .select({ id: schema.quizzes.id })
      .from(schema.quizzes)
      .where(eq(schema.quizzes.moduleId, moduleRow.id));
    if (!quiz) throw new Error(`Module ${moduleRow.sortOrder + 1} has no quiz.`);
    quizIds.push(quiz.id);
    const questions = await db
      .select({ id: schema.quizQuestions.id })
      .from(schema.quizQuestions)
      .where(eq(schema.quizQuestions.quizId, quiz.id));
    if (questions.length < 6 || questions.length > 8) {
      throw new Error(`Module ${moduleRow.sortOrder + 1} has ${questions.length} questions.`);
    }
    const cards = await db
      .select({ chunkRef: schema.reviewCards.chunkRef })
      .from(schema.reviewCards)
      .where(eq(schema.reviewCards.moduleId, moduleRow.id));
    if (cards.length < 5 || cards.length > 8) {
      throw new Error(`Module ${moduleRow.sortOrder + 1} has ${cards.length} cards.`);
    }
    if (cards.some((card) => card.chunkRef === null || !sourceChunkIds.has(card.chunkRef))) {
      throw new Error(`Module ${moduleRow.sortOrder + 1} has a card outside this source.`);
    }
  }

  return {
    unbookId: unbook.id,
    moduleIds: moduleRows.map((module) => module.id),
    quizIds,
  };
}

async function cleanupRun(db: Db, runId: string): Promise<void> {
  const schema = await import('@/db/schema');
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, emailFor(runId)))
    .limit(1);
  if (user) {
    await db.delete(schema.aiCalls).where(eq(schema.aiCalls.userId, user.id));
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
  }
  const [interest] = await db
    .select({ id: schema.interests.id })
    .from(schema.interests)
    .where(eq(schema.interests.slug, interestSlug(runId)))
    .limit(1);
  if (interest) await db.delete(schema.interests).where(eq(schema.interests.id, interest.id));
}

async function seed(): Promise<LearningSeed> {
  const databaseUrl = assertLocalDatabase(requireDatabaseUrl());
  process.env.DATABASE_URL = databaseUrl;
  const provider = await startFakeProvider();
  process.env.OPENROUTER_BASE_URL = provider.baseUrl;
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    process.env.OPENROUTER_API_KEY = 'fake-e2e-key';
  }

  const runId = runSuffix();
  let db: Db | null = null;
  try {
    const { db: database } = await import('@/db');
    db = database;
    return await withFakeAiTaskConfigs(db, async () => {
      const learner = await createLearner(db!, runId);
      const interestId = await createInterest(db!, runId, learner.userId);
      const generated = await seedUnbook(db!, {
        userId: learner.userId,
        interestId,
      });
      const seed: LearningSeed = { runId, ...learner, ...generated };
      await mkdir(dirname(AUTH_FILE), { recursive: true });
      await writeFile(AUTH_FILE, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
      return seed;
    });
  } catch (error) {
    if (db) await cleanupRun(db, runId).catch(() => undefined);
    throw error;
  } finally {
    await provider.close();
  }
}

async function cleanup(): Promise<number> {
  const databaseUrl = assertLocalDatabase(requireDatabaseUrl());
  process.env.DATABASE_URL = databaseUrl;
  let fixture: LearningSeed;
  try {
    fixture = JSON.parse(await readFile(AUTH_FILE, 'utf8')) as LearningSeed;
  } catch {
    console.log('No seeded learning fixture found; nothing to clean up.');
    return 0;
  }
  const { db } = await import('@/db');
  await cleanupRun(db, fixture.runId);
  await rm(AUTH_FILE, { force: true });
  console.log(`Removed learning fixture ${fixture.runId}.`);
  return 0;
}

async function main(): Promise<number> {
  const cleanupMode = process.argv.slice(2).includes('--cleanup');
  if (cleanupMode) return cleanup();
  const created = await seed();
  console.log(
    `Seeded learning fixture ${created.runId}: unbook ${created.unbookId}, ${created.moduleIds.length} modules.`,
  );
  console.log(`Session token written to ${AUTH_FILE}.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'unknown error');
    process.exit(1);
  },
);
