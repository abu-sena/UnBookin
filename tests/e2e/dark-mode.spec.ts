import { expect, test } from '@playwright/test';

import { readLearningSeed } from './support/config';
import { capture, expectNoHorizontalOverflow, signInWithSeed } from './support/ui';

test.use({ colorScheme: 'dark' });

test('dark mode has no horizontal overflow on module, quiz, and review', async ({
  page,
  context,
}) => {
  const seed = readLearningSeed();
  const moduleId = seed.moduleIds[0]!;
  await signInWithSeed(context, seed);

  await page.goto(`/unbook/${seed.unbookId}/module/${moduleId}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  test.info().annotations.push({
    type: 'screenshot',
    description: await capture(page, 'dark-01-module'),
  });

  await page.goto(`/unbook/${seed.unbookId}/module/${moduleId}/quiz`);
  await expect(page.getByRole('radio').first().or(page.getByRole('textbox')).first()).toBeVisible({
    timeout: 20_000,
  });
  await expectNoHorizontalOverflow(page);
  test.info().annotations.push({
    type: 'screenshot',
    description: await capture(page, 'dark-02-quiz'),
  });

  await page.goto('/review');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  test.info().annotations.push({
    type: 'screenshot',
    description: await capture(page, 'dark-03-review'),
  });
});
