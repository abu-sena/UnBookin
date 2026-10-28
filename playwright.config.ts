import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

import { E2E_BASE_URL, E2E_DATABASE_URL, E2E_PORT } from './tests/e2e/support/config';

function installedChromium(): string | undefined {
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    localAppData
      ? join(localAppData, 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe')
      : undefined,
  ];
  return candidates.find(
    (path): path is string => typeof path === 'string' && existsSync(path),
  );
}

const chromiumExecutable = installedChromium();

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: E2E_BASE_URL,
    browserName: 'chromium',
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    colorScheme: 'light',
    launchOptions: chromiumExecutable ? { executablePath: chromiumExecutable } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: 'm5-e2e-fixture-only',
      AUTH_URL: E2E_BASE_URL,
      NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
      AUTH_TRUST_HOST: 'true',
      INNGEST_DEV: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
