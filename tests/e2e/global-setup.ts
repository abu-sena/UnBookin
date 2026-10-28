import { spawnSync } from 'node:child_process';

import { E2E_DATABASE_URL } from './support/config';

function runSeed(args: string[]): void {
  const result = spawnSync(
    'pnpm',
    ['exec', 'tsx', '--conditions=react-server', 'scripts/dev/seed-learning.ts', ...args],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
      shell: true,
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    throw new Error(`Learning seed command failed with exit code ${result.status}.`);
  }
}

export default async function globalSetup(): Promise<void> {
  runSeed([]);
}
