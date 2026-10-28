import { spawnSync } from 'node:child_process';

import { E2E_DATABASE_URL } from './support/config';
import { assertLocalTestDatabase } from './support/guards';

function run(script: string, args: string[]): void {
  const result = spawnSync('pnpm', ['exec', 'tsx', '--conditions=react-server', script, ...args], {
    cwd: process.cwd(),
    // Explicit local test DB; the task env overrides anything inherited.
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    shell: true,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${script} ${args.join(' ')} failed with exit code ${result.status}.`);
  }
}

export default async function globalSetup(): Promise<void> {
  assertLocalTestDatabase(E2E_DATABASE_URL);
  run('scripts/dev/seed-learning.ts', []);
  try {
    run('scripts/dev/seed-journal.ts', []);
  } catch (error) {
    // The journal seed restores its own config on failure; also drop the learner now.
    try {
      run('scripts/dev/seed-journal.ts', ['--cleanup']);
    } finally {
      run('scripts/dev/seed-learning.ts', ['--cleanup']);
    }
    throw error;
  }
}
