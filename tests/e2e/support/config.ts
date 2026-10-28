import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { assertLocalBaseUrl, assertLocalTestDatabase } from './guards';

export const E2E_PORT = 3110;
export const E2E_BASE_URL = assertLocalBaseUrl(`http://localhost:${E2E_PORT}`);
export const E2E_DATABASE_URL = assertLocalTestDatabase(
  'postgres://unbookin:unbookin@127.0.0.1:5432/unbookin_m3_test_20261027',
);

/** Fake `action_feedback` provider (OpenRouter-compatible), loopback only. */
export const E2E_PROVIDER_PORT = 19346;
export const E2E_PROVIDER_ORIGIN = `http://127.0.0.1:${E2E_PROVIDER_PORT}`;
export const E2E_PROVIDER_BASE_URL = `${E2E_PROVIDER_ORIGIN}/api/v1`;
export const E2E_PROVIDER_KEY = 'm6-e2e-fixture-only';
/** Placeholder model written to the local test DB only; never a real model id. */
export const E2E_FEEDBACK_MODEL = 'fixture/m6-e2e-action-feedback';

export const AUTH_DIR = resolve(process.cwd(), 'tests', 'e2e', '.auth');
export const AUTH_FILE_PATH = resolve(AUTH_DIR, 'learning.json');
export const JOURNAL_FILE_PATH = resolve(AUTH_DIR, 'journal.json');
export const JOURNAL_CONFIG_BACKUP_PATH = resolve(AUTH_DIR, 'journal-task-config.json');

export type LearningSeed = {
  runId: string;
  userId: string;
  sessionToken: string;
  unbookId: string;
  moduleIds: string[];
  quizIds: string[];
};

export type ColorSchemeName = 'light' | 'dark';

export type JournalActionFixture = { id: string; title: string };

export type JournalSeed = {
  runId: string;
  userId: string;
  foreignUserId: string;
  foreignActionId: string;
  foreignTitle: string;
  foreignModuleTitle: string;
  interestId: string;
  domainIds: string[];
  /** Fixed due date used to exercise SSR(UTC) vs browser(Asia/Jakarta) rendering. */
  fixedDueIso: string;
  fixedDueText: string;
  actions: Record<
    ColorSchemeName,
    {
      extend: JournalActionFixture;
      skip: JournalActionFixture;
      report: JournalActionFixture;
    }
  >;
};

export function readLearningSeed(): LearningSeed {
  return JSON.parse(readFileSync(AUTH_FILE_PATH, 'utf8')) as LearningSeed;
}

export function readJournalSeed(): JournalSeed {
  return JSON.parse(readFileSync(JOURNAL_FILE_PATH, 'utf8')) as JournalSeed;
}
