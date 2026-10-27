#!/usr/bin/env node
/**
 * M4 engine evaluation CLI (PRD E3-01/02/04/05).
 *
 * Usage: pnpm eval:engine [--fake] [--only=name]
 *
 * Runs the real generation step services against five CC0 fixtures. The script
 * owns every row it creates (eval user, profile, interest, sources, Unbooks) and
 * removes them again, including on failure. It never touches production data:
 * Neon/Vercel database hosts are rejected before any connection is opened.
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq, gte, inArray } from 'drizzle-orm';

import * as dbSchema from '@/db/schema';
import { ModuleContent } from '@/lib/engine/module-content';
import {
  CardsResult,
  ModuleResult,
  OutlineResult,
  QuizResult,
  TaggingResult,
  type QuizQuestion,
} from '@/lib/engine/generation/schemas';

export type EvalOptions = { fake: boolean; only: string | null };

export function isProductionDatabaseUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('neon.tech') || lower.includes('vercel');
}

export function requireDatabaseUrl(value = process.env.DATABASE_URL): string {
  const url = value?.trim();
  if (!url) throw new Error('DATABASE_URL is required (use the isolated local test database).');
  if (isProductionDatabaseUrl(url)) {
    throw new Error('Refusing to run: DATABASE_URL looks like a Neon/Vercel production host.');
  }
  return url;
}

export function parseEvalArgs(argv: readonly string[]): EvalOptions {
  let fake = false;
  let only: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--fake') {
      fake = true;
      continue;
    }
    if (arg === '--only') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--only requires a fixture name.');
      only = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--only=')) {
      const value = arg.slice('--only='.length);
      if (!value) throw new Error('--only requires a fixture name.');
      only = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { fake, only };
}

export type FixtureKind = 'text' | 'epub' | 'pdf';

export type EngineFixture = {
  name: string;
  kind: FixtureKind;
  file: string;
  title: string;
  injectionMarkers?: readonly string[];
};

export const ENGINE_FIXTURES: readonly EngineFixture[] = [
  {
    name: 'leadership',
    kind: 'text',
    file: 'leadership-essay.txt',
    title: 'The Quiet Work of Leadership',
  },
  {
    name: 'productivity',
    kind: 'text',
    file: 'productivity-guide.md',
    title: 'A Practical Guide to Sustainable Productivity',
  },
  {
    name: 'epub',
    kind: 'epub',
    file: 'financial-habits.epub',
    title: 'Financial Habits for Ordinary Months',
  },
  {
    name: 'pdf',
    kind: 'pdf',
    file: 'learning-at-work.pdf',
    title: 'Learning at Work',
  },
  {
    name: 'injection',
    kind: 'text',
    file: 'injection-sample.txt',
    title: 'Personal Financial Planning (untrusted sample)',
    injectionMarkers: [
      'IGNORE ALL PREVIOUS INSTRUCTIONS',
      'SYSTEM PROMPT OVERRIDE',
      '</source>',
    ],
  },
];

const TASKS = ['outline', 'module', 'quiz', 'cards', 'tagging'] as const;
type EngineTask = (typeof TASKS)[number];

const COST_BY_TASK: Record<EngineTask, number> = {
  outline: 0.01,
  module: 0.02,
  quiz: 0.01,
  cards: 0.005,
  tagging: 0.001,
};

function fixtureDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'engine');
}

function uniqueInOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function extractChunkIds(content: string): string[] {
  const ids: string[] = [];
  // Only real wrappers start with a literal "<source"; injected text is escaped
  // to "&lt;source" by wrapSource and must never be treated as a chunk ID.
  const pattern = /<source chunk_id="([^"]+)"/g;
  for (const match of content.matchAll(pattern)) {
    if (match[1]) ids.push(match[1]);
  }
  return uniqueInOrder(ids);
}

function extractSectionIds(content: string): string[] {
  const sections = readJsonAfter(content, 'Ordered sections (quoted data): ');
  if (Array.isArray(sections)) {
    return sections.flatMap((section) => {
      if (!section || typeof section !== 'object') return [];
      const id = (section as { id?: unknown }).id;
      return typeof id === 'string' ? [id] : [];
    });
  }
  return extractChunkIds(content);
}

/** Read the JSON value that immediately follows a marker in a prompt. */
function readJsonAfter(content: string, marker: string): unknown {
  const index = content.indexOf(marker);
  if (index < 0) return undefined;
  const rest = content.slice(index + marker.length).trimStart();
  const first = rest[0];
  if (first !== '[' && first !== '{') return undefined;
  const closing = first === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let position = 0; position < rest.length; position += 1) {
    const char = rest[position]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === first) depth += 1;
    else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(rest.slice(0, position + 1)) as unknown;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

function groupSections(sectionIds: readonly string[]): string[][] {
  const count = sectionIds.length;
  if (count < 3) {
    throw new Error(
      `Outline needs at least 3 sections to produce 3 modules; received ${count}.`,
    );
  }
  const moduleCount = Math.min(count, 12);
  const groups: string[][] = [];
  let start = 0;
  for (let index = 0; index < moduleCount; index += 1) {
    const modulesLeft = moduleCount - index;
    const sectionsLeft = count - start;
    const take = Math.max(1, Math.floor(sectionsLeft / modulesLeft));
    groups.push(sectionIds.slice(start, start + take));
    start += take;
  }
  return groups;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function modulePlan(content: string): { title: string; summary: string } {
  const plan = asRecord(readJsonAfter(content, 'Module plan (quoted data): '));
  return {
    title: asString(plan.title, 'Modul Praktik').slice(0, 90),
    summary: asString(plan.summary, 'Ringkasan modul dari sumber yang dipilih.').slice(0, 300),
  };
}

function outlineData(content: string): OutlineResult {
  const sections = groupSections(extractSectionIds(content));
  return {
    title: 'Unbook Evaluasi',
    bigIdea: 'Latihan terarah mengubah informasi menjadi kebiasaan yang bisa dipakai.',
    modules: sections.map((sectionIds, index) => ({
      title: `Modul ${index + 1}: Latihan Terarah`.slice(0, 90),
      summary: `Kelompok bagian ${index + 1} membahas langkah praktis dan alasan di baliknya.`.slice(
        0,
        300,
      ),
      sectionIds,
    })),
  };
}

function moduleData(content: string): ModuleResult {
  const plan = modulePlan(content);
  const chunks = extractChunkIds(content);
  if (chunks.length === 0) throw new Error('Module prompt contained no chunk IDs.');
  const concept = (index: number) => ({
    concept: `Konsep ${index + 1}`,
    explanation:
      'Konsep ini dijelaskan sebagai langkah yang bisa dicoba, lalu diperiksa hasilnya sebelum dilanjutkan.',
    chunkRefs: [chunks[index % chunks.length]!],
  });
  return {
    title: plan.title,
    summary: plan.summary,
    content: {
      bigIdea: 'Perubahan kecil yang konsisten lebih berguna daripada rencana besar tanpa tindakan.',
      whyItMatters:
        'Pembaca perlu cara yang bisa diulang pada minggu biasa, bukan hanya pada hari yang sempurna.',
      layers: {
        eli5: 'Bayangkan belajar seperti merawat tanaman: sedikit air setiap hari lebih baik daripada banjir sekali sebulan.',
        practitioner: [concept(0), concept(1), concept(2)],
        expert: {
          assumptions: ['Pembaca punya sedikit waktu yang bisa dilindungi setiap minggu.'],
          evidence: ['Contoh dan langkah diambil dari bagian sumber yang dirujuk.'],
          critiques: ['Pendekatan ini tidak menyelesaikan masalah struktural yang besar.'],
          compareWith: ['Kebiasaan atomik', 'Perencanaan berbasis hasil'],
        },
      },
      conceptMap: {
        nodes: [
          { id: 'core', label: 'Inti praktik', kind: 'core' },
          { id: 'langkah', label: 'Langkah kecil', kind: 'concept' },
          { id: 'tinjau', label: 'Tinjau hasil', kind: 'concept' },
          { id: 'contoh', label: 'Contoh sehari-hari', kind: 'example' },
        ],
        edges: [
          { from: 'core', to: 'langkah' },
          { from: 'langkah', to: 'tinjau' },
          { from: 'core', to: 'contoh' },
        ],
      },
      application: {
        caseStudy: {
          title: 'Menerapkan pada minggu yang sibuk',
          situation: 'Ada banyak permintaan dan sedikit waktu untuk berpikir.',
          howToApply: ['Pilih satu hasil', 'Batasi waktu', 'Tinjau hasil di akhir minggu'],
        },
        tools: [
          {
            name: 'Daftar periksa singkat',
            type: 'checklist',
            items: ['Tulis hasil yang diinginkan', 'Tentukan batas waktu', 'Catat apa yang berubah'],
          },
        ],
        actionThisWeek: {
          title: 'Coba satu langkah kecil',
          steps: ['Pilih satu bagian sumber', 'Terapkan selama sepuluh menit', 'Catat hasilnya'],
          doneWhen: 'Satu langkah selesai dan hasilnya dicatat.',
        },
        commonMistakes: ['Memulai terlalu banyak hal sekaligus', 'Melewati tinjauan hasil'],
      },
      estimatedMinutes: 8,
    },
  };
}

function quizData(content: string): QuizResult {
  const chunks = extractChunkIds(content);
  if (chunks.length === 0) throw new Error('Quiz prompt contained no chunk IDs.');
  const levels: QuizQuestion['bloomLevel'][] = [
    'remember',
    'understand',
    'apply',
    'analyze',
    'apply',
    'evaluate',
  ];
  return {
    questions: levels.map((bloomLevel, index) => ({
      type: 'mcq',
      bloomLevel,
      prompt: `Soal ${index + 1}: langkah mana yang paling tepat untuk menerapkan prinsip ini?`,
      explanation: 'Jawaban benar menekankan langkah kecil yang dapat ditinjau ulang.',
      chunkRefs: [chunks[index % chunks.length]!],
      options: ['Langkah kecil dan terukur', 'Rencana besar tanpa catatan', 'Menunda tinjauan'],
      correct: 0,
    })),
  };
}

function cardsData(content: string): CardsResult {
  const chunks = extractChunkIds(content);
  if (chunks.length === 0) throw new Error('Cards prompt contained no chunk IDs.');
  return {
    cards: Array.from({ length: 6 }, (_, index) => ({
      front: `Kartu ${index + 1}: apa langkah pertama yang perlu dicatat?`,
      back: 'Tulis hasil yang diinginkan, batas waktu, dan bukti yang akan diperiksa.',
      chunkRef: chunks[index % chunks.length]!,
    })),
  };
}

type TaggingInterest = {
  slug?: unknown;
  domains?: { slug?: unknown }[];
};

function taggingData(content: string): TaggingResult {
  const modules = readJsonAfter(content, 'Modules (quoted data, index is moduleIndex): ');
  const interests = readJsonAfter(content, 'Allowed interests and domains (quoted data): ');
  const moduleCount = Array.isArray(modules) ? modules.length : 0;
  if (moduleCount === 0) throw new Error('Tagging prompt contained no modules.');
  const candidates = Array.isArray(interests) ? (interests as TaggingInterest[]) : [];
  const chosen =
    candidates.find(
      (interest) =>
        typeof interest.slug === 'string' &&
        interest.slug !== 'general' &&
        Array.isArray(interest.domains) &&
        interest.domains.length > 0,
    ) ?? candidates.find((interest) => interest.slug === 'general');
  if (!chosen || typeof chosen.slug !== 'string') {
    throw new Error('Tagging prompt contained no usable interest.');
  }
  const domainSlug =
    typeof chosen.domains?.[0]?.slug === 'string' ? chosen.domains[0].slug : null;
  return {
    interestSlug: chosen.slug,
    modules: Array.from({ length: moduleCount }, (_, moduleIndex) => ({
      moduleIndex,
      domains:
        chosen.slug !== 'general' && domainSlug
          ? [{ domainSlug, confidence: 0.8 }]
          : [],
    })),
  };
}

export function buildFakeTaskData(task: string, content: string): unknown {
  switch (task) {
    case 'outline':
      return outlineData(content);
    case 'module':
      return moduleData(content);
    case 'quiz':
      return quizData(content);
    case 'cards':
      return cardsData(content);
    case 'tagging':
      return taggingData(content);
    default:
      throw new Error(`Unsupported fake task: ${task}`);
  }
}

type ChatRequest = {
  model?: unknown;
  messages?: { role?: string; content?: string }[];
  response_format?: { json_schema?: { name?: string } };
};

function parseChatRequest(body: unknown): { task: string; content: string } {
  const request = asRecord(body) as ChatRequest;
  const task = request.response_format?.json_schema?.name;
  const messages = Array.isArray(request.messages) ? request.messages : [];
  const user = [...messages].reverse().find((message) => message.role === 'user');
  if (typeof task !== 'string' || typeof user?.content !== 'string') {
    throw new Error('Fake provider received an unsupported chat request.');
  }
  return { task, content: user.content };
}

export type FakeCompletion = {
  id: string;
  model: string;
  choices: { message: { role: 'assistant'; content: string } }[];
  usage: { prompt_tokens: number; completion_tokens: number; cost: number };
};

export function buildFakeCompletion(body: unknown): FakeCompletion {
  const { task, content } = parseChatRequest(body);
  const data = buildFakeTaskData(task, content);
  const encoded = JSON.stringify(data);
  return {
    id: `fake-${task}`,
    model: 'fake/model',
    choices: [{ message: { role: 'assistant', content: encoded } }],
    usage: {
      prompt_tokens: Math.max(1, Math.ceil(content.length / 4)),
      completion_tokens: Math.max(1, Math.ceil(encoded.length / 4)),
      cost: COST_BY_TASK[task as EngineTask] ?? 0.001,
    },
  };
}

export type FakeProvider = { baseUrl: string; close: () => Promise<void> };

type TaskConfigRow = typeof dbSchema.aiTaskConfigs.$inferSelect;

type TaskConfigBackup = { task: string; previous: TaskConfigRow | null };

async function installFakeTaskConfigs(
  db: typeof import('@/db').db,
  resetCache: () => void,
  backup: TaskConfigBackup[],
): Promise<void> {
  for (const task of TASKS) {
    const [previous] = await db
      .select()
      .from(dbSchema.aiTaskConfigs)
      .where(eq(dbSchema.aiTaskConfigs.task, task));
    backup.push({ task, previous: previous ?? null });
    await db
      .insert(dbSchema.aiTaskConfigs)
      .values({
        task,
        model: 'fake/model',
        fallbackModel: null,
        temperature: 0.3,
        maxOutputTokens: 4000,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: dbSchema.aiTaskConfigs.task,
        set: {
          model: 'fake/model',
          fallbackModel: null,
          temperature: 0.3,
          maxOutputTokens: 4000,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }
  resetCache();
}

async function restoreTaskConfigs(
  db: typeof import('@/db').db,
  backup: readonly TaskConfigBackup[],
  resetCache: () => void,
): Promise<void> {
  for (const { task, previous } of backup) {
    if (previous) {
      await db
        .update(dbSchema.aiTaskConfigs)
        .set({
          model: previous.model,
          fallbackModel: previous.fallbackModel,
          temperature: previous.temperature,
          maxOutputTokens: previous.maxOutputTokens,
          isActive: previous.isActive,
          updatedAt: previous.updatedAt,
        })
        .where(eq(dbSchema.aiTaskConfigs.task, task));
    } else {
      await db.delete(dbSchema.aiTaskConfigs).where(eq(dbSchema.aiTaskConfigs.task, task));
    }
  }
  resetCache();
}

async function missingTaskConfigs(db: typeof import('@/db').db): Promise<string[]> {
  const rows = await db
    .select({ task: dbSchema.aiTaskConfigs.task, isActive: dbSchema.aiTaskConfigs.isActive })
    .from(dbSchema.aiTaskConfigs)
    .where(inArray(dbSchema.aiTaskConfigs.task, [...TASKS]));
  const active = new Set(rows.filter((row) => row.isActive).map((row) => row.task));
  return TASKS.filter((task) => !active.has(task));
}

type EvalContext = { userId: string; interestId: string; runId: string };

function runSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createEvalContext(
  db: typeof import('@/db').db,
  runId = runSuffix(),
): Promise<EvalContext> {
  const [user] = await db
    .insert(dbSchema.users)
    .values({ name: 'Engine Eval Worker', email: `eval-${runId}@example.invalid` })
    .returning({ id: dbSchema.users.id });
  if (!user) throw new Error('Could not create the throwaway eval user.');
  let interestId: string | null = null;
  try {
    await db.insert(dbSchema.profiles).values({
      userId: user.id,
      displayName: 'Engine Eval Worker',
      jobRole: 'Knowledge worker',
      goal: 'Apply practical ideas at work',
      experienceLevel: 'intermediate',
    });
    const [interest] = await db
      .insert(dbSchema.interests)
      .values({
        slug: `eval-${runId}`,
        name: 'Evaluasi Engine',
        description: 'Temporary interest created by pnpm eval:engine.',
        colorToken: 'chart-1',
        sortOrder: 0,
      })
      .returning({ id: dbSchema.interests.id });
    if (!interest) throw new Error('Could not create the throwaway eval interest.');
    interestId = interest.id;
    await db.insert(dbSchema.domains).values([
      { interestId: interest.id, slug: 'practice', name: 'Praktik', sortOrder: 0 },
      { interestId: interest.id, slug: 'review', name: 'Tinjauan', sortOrder: 1 },
    ]);
    await db
      .insert(dbSchema.userInterests)
      .values({ userId: user.id, interestId: interest.id, isPrimary: true });
  } catch (error) {
    if (interestId) {
      await db.delete(dbSchema.interests).where(eq(dbSchema.interests.id, interestId));
    }
    await db.delete(dbSchema.users).where(eq(dbSchema.users.id, user.id));
    throw error;
  }
  if (!interestId) throw new Error('Could not create the throwaway eval interest.');
  return { userId: user.id, interestId, runId };
}

/** Remove every row this run created; ai_calls is kept by FK design so delete it first. */
async function cleanupEvalContext(
  db: typeof import('@/db').db,
  context: EvalContext | null,
): Promise<void> {
  if (!context) return;
  await db.delete(dbSchema.aiCalls).where(eq(dbSchema.aiCalls.userId, context.userId));
  await db.delete(dbSchema.users).where(eq(dbSchema.users.id, context.userId));
  await db.delete(dbSchema.interests).where(eq(dbSchema.interests.id, context.interestId));
}

export type FixtureResult = {
  name: string;
  modules: number;
  questions: number;
  cards: number;
  costUsd: number;
  costComplete: boolean;
  wallMs: number;
  failures: string[];
};

const MODULE_BATCH_SIZE = 3;

type SourceChunkLike = { chapterTitle: string | null; sectionIndex?: number };

function persistedChapterTitle(chunk: SourceChunkLike): string | null {
  if (chunk.chapterTitle !== null) return chunk.chapterTitle;
  return chunk.sectionIndex === undefined ? null : `__section:${chunk.sectionIndex}`;
}

function conceptMapIssues(content: ModuleContent): string[] {
  const issues: string[] = [];
  const ids = content.conceptMap.nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) issues.push('concept node IDs are not unique');
  if (content.conceptMap.nodes.filter((node) => node.kind === 'core').length !== 1) {
    issues.push('concept map must have exactly one core node');
  }
  if (content.conceptMap.nodes.length > 20) issues.push('concept map exceeds 20 nodes');
  const known = new Set(ids);
  if (content.conceptMap.edges.some((edge) => !known.has(edge.from) || !known.has(edge.to))) {
    issues.push('concept edge points at a missing node');
  }
  return issues;
}

async function verifyFixture(
  db: typeof import('@/db').db,
  fixture: EngineFixture,
  ids: { sourceId: string; unbookId: string; userId: string },
  startedAt: Date,
  wallMs: number,
): Promise<FixtureResult> {
  const failures: string[] = [];
  const [unbook] = await db
    .select()
    .from(dbSchema.unbooks)
    .where(eq(dbSchema.unbooks.id, ids.unbookId));
  const moduleRows = await db
    .select()
    .from(dbSchema.modules)
    .where(eq(dbSchema.modules.unbookId, ids.unbookId));
  moduleRows.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const sourceChunkRows = await db
    .select({ id: dbSchema.sourceChunks.id })
    .from(dbSchema.sourceChunks)
    .where(eq(dbSchema.sourceChunks.sourceId, ids.sourceId));
  const sourceChunkIds = new Set(sourceChunkRows.map((chunk) => chunk.id));

  if (!unbook || unbook.status !== 'ready') failures.push('unbook is not ready');
  if (moduleRows.length < 3 || moduleRows.length > 12) {
    failures.push(`module count ${moduleRows.length} is outside 3-12`);
  }

  let questions = 0;
  let cards = 0;
  const moduleText: string[] = [];
  for (const moduleRow of moduleRows) {
    const parsed = ModuleContent.safeParse(moduleRow.content);
    if (!parsed.success) {
      failures.push(`module ${moduleRow.sortOrder + 1} content does not parse`);
      continue;
    }
    const content = parsed.data;
    moduleText.push(moduleRow.title, moduleRow.summary ?? '', JSON.stringify(content));
    for (const concept of content.layers.practitioner) {
      if (concept.chunkRefs.length === 0) {
        failures.push(`module ${moduleRow.sortOrder + 1} concept has no chunkRefs`);
        continue;
      }
      for (const chunkRef of concept.chunkRefs) {
        if (!sourceChunkIds.has(chunkRef)) {
          failures.push(`module ${moduleRow.sortOrder + 1} cites a chunk outside this source`);
        }
      }
    }
    failures.push(
      ...conceptMapIssues(content).map(
        (issue) => `module ${moduleRow.sortOrder + 1}: ${issue}`,
      ),
    );
    const quizRows = await db
      .select()
      .from(dbSchema.quizzes)
      .where(eq(dbSchema.quizzes.moduleId, moduleRow.id));
    const active = quizRows.filter((quiz) => quiz.isActive);
    if (active.length !== 1) {
      failures.push(`module ${moduleRow.sortOrder + 1} has ${active.length} active quizzes`);
    }
    const quiz = active[0];
    const questionCount = quiz
      ? (
          await db
            .select({ id: dbSchema.quizQuestions.id })
            .from(dbSchema.quizQuestions)
            .where(eq(dbSchema.quizQuestions.quizId, quiz.id))
        ).length
      : 0;
    questions += questionCount;
    if (questionCount < 6 || questionCount > 8) {
      failures.push(`module ${moduleRow.sortOrder + 1} has ${questionCount} questions`);
    }
    const cardCount = (
      await db
        .select({ id: dbSchema.reviewCards.id })
        .from(dbSchema.reviewCards)
        .where(eq(dbSchema.reviewCards.moduleId, moduleRow.id))
    ).length;
    cards += cardCount;
    if (cardCount < 5 || cardCount > 8) {
      failures.push(`module ${moduleRow.sortOrder + 1} has ${cardCount} cards`);
    }
  }

  if (fixture.injectionMarkers) {
    const joined = moduleText.join('\n');
    for (const marker of fixture.injectionMarkers) {
      if (joined.includes(marker)) {
        failures.push(`generated module text contains injected phrase: ${marker}`);
      }
    }
  }

  const costUsd = Number(unbook?.costUsd ?? 0);
  if (!Number.isFinite(costUsd) || costUsd <= 0) failures.push('unbook cost_usd is not recorded');
  const calls = await db
    .select({ costUsd: dbSchema.aiCalls.costUsd })
    .from(dbSchema.aiCalls)
    .where(
      and(
        eq(dbSchema.aiCalls.userId, ids.userId),
        gte(dbSchema.aiCalls.createdAt, startedAt),
      ),
    );
  const costComplete = calls.length > 0 && calls.every((call) => call.costUsd !== null);
  if (!costComplete) failures.push('one or more AI calls has no recorded cost');

  return {
    name: fixture.name,
    modules: moduleRows.length,
    questions,
    cards,
    costUsd,
    costComplete,
    wallMs,
    failures,
  };
}

async function runFixture(
  db: typeof import('@/db').db,
  fixture: EngineFixture,
  context: EvalContext,
): Promise<FixtureResult> {
  const [{ extractSource }, { chunkSource }, steps, store, generationContext] =
    await Promise.all([
      import('@/lib/ingest/extract'),
      import('@/lib/ingest/chunk'),
      import('@/lib/generation/steps'),
      import('@/lib/generation/store'),
      import('@/lib/generation/context'),
    ]);

  const bytes = await readFile(join(fixtureDirectory(), fixture.file));
  const extracted = await extractSource({
    type: fixture.kind,
    bytes: new Uint8Array(bytes),
    maxPages: 500,
    maxBytes: 20 * 1024 * 1024,
  });
  const chunks = chunkSource(extracted.pages);
  if (chunks.length === 0) throw new Error('fixture produced no chunks');

  let markers: (string | null)[] = chunks.map((chunk) => persistedChapterTitle(chunk));
  if (new Set(markers).size < 3) {
    // Chapterless plain text can collapse to one structural section, which cannot
    // satisfy the outline contract (3+ modules, every section used once). Give
    // each chunk its own synthetic structural section for this evaluation run.
    markers = chunks.map((_, index) => `__section:${index + 1}`);
  }

  const [source] = await db
    .insert(dbSchema.sources)
    .values({
      userId: context.userId,
      type: fixture.kind,
      title: fixture.title,
      status: 'ready',
      rightsConfirmedAt: new Date(),
      pageCount: extracted.pageCount,
      wordCount: extracted.wordCount,
      sizeBytes: bytes.byteLength,
      language: 'en',
    })
    .returning({ id: dbSchema.sources.id });
  if (!source) throw new Error('could not insert fixture source');
  await db.insert(dbSchema.sourceChunks).values(
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
    .insert(dbSchema.unbooks)
    .values({
      userId: context.userId,
      sourceId: source.id,
      title: fixture.title,
      interestId: context.interestId,
      status: 'queued',
    })
    .returning({ id: dbSchema.unbooks.id });
  if (!unbook) throw new Error('could not insert fixture unbook');

  const ids = { sourceId: source.id, userId: context.userId, unbookId: unbook.id };
  const startedAt = new Date();
  const started = process.hrtime.bigint();
  const start = await store.startOutline(ids);
  if (start.state === 'skip') throw new Error('unbook became unusable before outline');
  if (start.state === 'outline') await steps.runOutlineStep(ids);
  const work = await generationContext.listModuleWork(ids);
  if (!work) throw new Error('could not list module work');
  for (let index = 0; index < work.length; index += MODULE_BATCH_SIZE) {
    const batch = work.slice(index, index + MODULE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (module) => {
        if (!module.hasContent) await steps.runModuleContentStep(ids, module.moduleId);
        if (!module.hasQuiz) await steps.runQuizStep(ids, module.moduleId);
        if (!module.hasCards) await steps.runCardsStep(ids, module.moduleId);
      }),
    );
  }
  await steps.runTaggingStep(ids);
  await steps.runFinalizeStep(ids);
  const wallMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  return verifyFixture(db, fixture, ids, startedAt, wallMs);
}

function printTable(results: readonly FixtureResult[]): void {
  const rows = results.map((result) => ({
    fixture: result.name,
    modules: result.modules,
    quiz: result.questions,
    cards: result.cards,
    costUsd: result.costUsd.toFixed(6),
    costComplete: result.costComplete ? 'yes' : 'no',
    wallMs: result.wallMs,
    result: result.failures.length === 0 ? 'PASS' : 'FAIL',
  }));
  console.table(rows);
  for (const result of results) {
    for (const failure of result.failures) console.log(`  ${result.name}: ${failure}`);
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let provider: FakeProvider | null = null;
  let db: typeof import('@/db').db | null = null;
  let context: EvalContext | null = null;
  const backup: TaskConfigBackup[] = [];
  let resetCache = () => {};
  let fakeConfigsInstalled = false;
  try {
    const options = parseEvalArgs(argv);
    const databaseUrl = requireDatabaseUrl();
    process.env.DATABASE_URL = databaseUrl;

    if (options.fake) {
      provider = await startFakeProvider();
      process.env.OPENROUTER_BASE_URL = provider.baseUrl;
      if (!process.env.OPENROUTER_API_KEY?.trim()) {
        process.env.OPENROUTER_API_KEY = 'fake-eval-key';
      }
      console.log(`Fake OpenRouter endpoint: ${provider.baseUrl}`);
    } else if (!process.env.OPENROUTER_API_KEY?.trim()) {
      console.error('Real mode requires OPENROUTER_API_KEY.');
      return 2;
    }

    const database = await import('@/db');
    db = database.db;
    const taskConfig = await import('@/lib/ai/task-config');
    resetCache = taskConfig.resetTaskConfigCache;

    if (options.fake) {
      fakeConfigsInstalled = true;
      await installFakeTaskConfigs(db, resetCache, backup);
    } else {
      const missing = await missingTaskConfigs(db);
      if (missing.length > 0) {
        console.error(`Missing active ai_task_configs rows: ${missing.join(', ')}`);
        return 2;
      }
    }

    context = await createEvalContext(db);
    const fixtures = options.only
      ? ENGINE_FIXTURES.filter((fixture) => fixture.name === options.only)
      : ENGINE_FIXTURES;
    if (fixtures.length === 0) {
      console.error(
        `Unknown fixture "${options.only}". Available: ${ENGINE_FIXTURES.map((f) => f.name).join(', ')}`,
      );
      return 2;
    }

    const results: FixtureResult[] = [];
    for (const fixture of fixtures) {
      console.log(`\nRunning fixture ${fixture.name} (${fixture.kind}) ...`);
      try {
        results.push(await runFixture(db, fixture, context));
      } catch (error) {
        results.push({
          name: fixture.name,
          modules: 0,
          questions: 0,
          cards: 0,
          costUsd: 0,
          costComplete: false,
          wallMs: 0,
          failures: [error instanceof Error ? error.message : 'unknown failure'],
        });
      }
    }
    printTable(results);
    return results.every((result) => result.failures.length === 0) ? 0 : 1;
  } catch (error) {
    console.error(
      `eval:engine failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return 1;
  } finally {
    if (db) {
      try {
        await cleanupEvalContext(db, context);
      } catch (error) {
        console.error(
          `cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
      if (fakeConfigsInstalled) {
        try {
          await restoreTaskConfigs(db, backup, resetCache);
        } catch (error) {
          console.error(
            `ai_task_configs restore failed: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        }
      }
    }
    if (provider) {
      try {
        await provider.close();
      } catch {
        // best-effort shutdown; the process is about to exit
      }
    }
  }
}

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}

if (isEntrypoint()) {
  main().then(
    // Exit explicitly: imported app modules may hold timers or pools open after cleanup.
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : 'unknown error');
      process.exit(1);
    },
  );
}

/** In-process OpenRouter-compatible endpoint; no external network is used. */
export function startFakeProvider(): Promise<FakeProvider> {
  return new Promise((resolveProvider, reject) => {
    const server = createServer((request, response) => {
      let body = '';
      let size = 0;
      request.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1_048_576) {
          response.writeHead(413).end();
          request.destroy();
          return;
        }
        body += chunk.toString('utf8');
      });
      request.on('end', () => {
        try {
          const completion = buildFakeCompletion(JSON.parse(body) as unknown);
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(completion));
        } catch {
          response.writeHead(400, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: { message: 'fake provider rejected request' } }));
        }
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not bind fake provider.'));
        return;
      }
      resolveProvider({
        baseUrl: `http://127.0.0.1:${address.port}`,
        // fetch keeps sockets alive; close() alone would wait for them forever.
        close: () =>
          new Promise((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
