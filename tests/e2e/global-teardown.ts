import { spawnSync } from 'node:child_process';

import { E2E_DATABASE_URL } from './support/config';
import { assertLocalTestDatabase } from './support/guards';

function run(script: string): number | null {
  return spawnSync('pnpm', ['exec', 'tsx', '--conditions=react-server', script, '--cleanup'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    shell: true,
    stdio: 'inherit',
  }).status;
}

export default async function globalTeardown(): Promise<void> {
  assertLocalTestDatabase(E2E_DATABASE_URL);
  // Journal first (restores task config, removes foreign user), learner last.
  // Both always run, even when the first cleanup fails.
  const journal = run('scripts/dev/seed-journal.ts');
  const learning = run('scripts/dev/seed-learning.ts');
  if (journal !== 0 || learning !== 0) {
    throw new Error(`E2E cleanup failed (journal ${journal}, learning ${learning}).`);
  }
}
