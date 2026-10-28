import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const E2E_PORT = 3110;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DATABASE_URL =
  'postgres://unbookin:unbookin@127.0.0.1:5432/unbookin_m3_test_20261027';

export const AUTH_FILE_PATH = resolve(process.cwd(), 'tests', 'e2e', '.auth', 'learning.json');

export type LearningSeed = {
  runId: string;
  userId: string;
  sessionToken: string;
  unbookId: string;
  moduleIds: string[];
  quizIds: string[];
};

export function readLearningSeed(): LearningSeed {
  return JSON.parse(readFileSync(AUTH_FILE_PATH, 'utf8')) as LearningSeed;
}
