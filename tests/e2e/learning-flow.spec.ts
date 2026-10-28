import { expect, test } from '@playwright/test';

import id from '../../src/messages/id.json';
import { readLearningSeed } from './support/config';
import {
  openDb,
  readModuleStatus,
  readQuizAnswers,
  readTotalXp,
  readXpEvents,
  type Db,
} from './support/db';
import { answerQuiz } from './support/quiz';
import { capture, expectNoHorizontalOverflow, signInWithSeed } from './support/ui';

test.describe('Alur A — module, action, quiz pass', () => {
  let db: Db;

  test.beforeAll(() => {
    db = openDb();
  });

  test.afterAll(async () => {
    await db.end();
  });

  test('reads module 1, starts the weekly action, and passes the quiz', async ({
    page,
    context,
  }) => {
    const seed = readLearningSeed();
    const firstModuleId = seed.moduleIds[0]!;
    const firstQuizId = seed.quizIds[0]!;
    const answers = await readQuizAnswers(db, firstQuizId);
    expect(answers.length).toBeGreaterThanOrEqual(6);

    await signInWithSeed(context, seed);

    await page.goto(`/unbook/${seed.unbookId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('list', { name: id.module.path.listAria })).toBeVisible();
    const firstNode = page.getByRole('button', { name: /^Modul 1:/ });
    await expect(firstNode).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    test.info().annotations.push({
      type: 'screenshot',
      description: await capture(page, 'light-01-unbook-path'),
    });
    await firstNode.click();

    await page.getByRole('tab', { name: id.module.layerToggle.layers.practitioner }).click();
    const sourceChip = page
      .getByRole('button', { name: /^(hlm\.\s*\d+|Sumber)$/ })
      .first();
    await sourceChip.click();
    const sheet = page.locator('[data-slot="drawer-content"]');
    await expect(sheet).toBeVisible();
    const excerpt = sheet.locator('blockquote');
    await expect(excerpt).toBeVisible();
    expect((await excerpt.textContent())?.trim().length ?? 0).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await page.locator('[data-reader-end]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.getByRole('tab', { name: id.reader.module.tabs.apply }).click();

    const checklist = page.getByRole('checkbox').first();
    await checklist.click();
    await expect(checklist).toBeChecked();
    await page.getByRole('button', { name: id.module.action.cta }).click();
    await expect(page.getByRole('button', { name: id.module.action.created })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    test.info().annotations.push({
      type: 'screenshot',
      description: await capture(page, 'light-02-module-apply'),
    });

    await page.getByRole('tab', { name: id.reader.module.tabs.prove }).click();
    await page.getByRole('link', { name: id.reader.module.prove.startQuiz }).click();
    await expect(page).toHaveURL(new RegExp(`/module/${firstModuleId}/quiz$`));

    await answerQuiz(page, answers);
    await expect(page.getByText(id.quiz.result.passedTitle)).toBeVisible();
    await expect(page.getByText(id.game.xpToast.amount.replace('{amount}', '40'))).toBeVisible();
    await expectNoHorizontalOverflow(page);
    test.info().annotations.push({
      type: 'screenshot',
      description: await capture(page, 'light-03-quiz-passed'),
    });

    expect(await readModuleStatus(db, seed.userId, firstModuleId)).toBe('read');
    expect(await readTotalXp(db, seed.userId)).toBe(60);
    const events = await readXpEvents(db, seed.userId);
    expect(events.map((event) => event.type).sort()).toEqual(
      ['module_read', 'quiz_pass', 'quiz_perfect'].sort(),
    );

    await page.getByRole('link', { name: id.quizFlow.result.backToModule }).click();
    await page
      .getByRole('link', { name: id.reader.module.back, exact: true })
      .click();
    await expect(page.getByRole('button', { name: /^Modul 1:.*selesai$/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    test.info().annotations.push({
      type: 'screenshot',
      description: await capture(page, 'light-04-path-module-done'),
    });
  });

  test(
    'home shows the planned action and tomorrow review',
    async ({ page, context }) => {
      const seed = readLearningSeed();
      await signInWithSeed(context, seed);
      await page.goto('/home');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(id.home.today.actionsTitle)).toBeVisible();
      await expect(page.getByText(id.home.today.actionsEmpty)).toHaveCount(0);
      await expect(page.getByText(/^Review besok: \d+ kartu$/)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, 'light-05-home'),
      });
    },
  );
});
