import { expect, test } from '@playwright/test';

test('homepage is reachable', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
});
