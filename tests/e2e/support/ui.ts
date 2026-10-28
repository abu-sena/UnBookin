import { expect, type BrowserContext, type Page } from '@playwright/test';
import { join } from 'node:path';

import type { LearningSeed } from './config';

export async function signInWithSeed(context: BrowserContext, seed: LearningSeed): Promise<void> {
  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: seed.sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    },
  ]);
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    widths.scrollWidth,
    `horizontal overflow: scrollWidth ${widths.scrollWidth} > innerWidth ${widths.innerWidth}`,
  ).toBeLessThanOrEqual(widths.innerWidth);
}

export async function capture(page: Page, name: string): Promise<string> {
  const path = join('test-results', 'screens', `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}
