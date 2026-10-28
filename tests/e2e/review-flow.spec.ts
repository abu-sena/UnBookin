import { expect, test } from '@playwright/test';

import id from '../../src/messages/id.json';
import { readLearningSeed } from './support/config';
import { makeCardsDueNow, openDb, readDueCardCount, readTotalXp, type Db } from './support/db';
import { expectLedger } from './support/journal';
import { capture, expectNoHorizontalOverflow, signInWithSeed } from './support/ui';

test.describe('Next-day review', () => {
  let db: Db;

  test.beforeAll(() => {
    db = openDb();
  });

  test.afterAll(async () => {
    await db.end();
  });

  test('flips and rates every due card, awards review XP, and clears the badge', async ({
    page,
    context,
  }) => {
    const seed = readLearningSeed();
    await makeCardsDueNow(db, seed.userId);
    expect(await readDueCardCount(db, seed.userId)).toBeGreaterThan(0);
    await signInWithSeed(context, seed);

    await page.goto('/review');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const ratings = [id.review.rating.again, id.review.rating.hard, id.review.rating.good];
    for (let index = 0; index < 20; index += 1) {
      const card = page.locator('button[aria-pressed]').first();
      if ((await card.count()) === 0) break;
      await card.click();
      const rating = ratings[index % ratings.length]!;
      await page
        .getByRole('group', { name: id.review.rating.label })
        .getByRole('button', { name: rating })
        .click();
    }

    await expect(page.getByText(id.reviewSession.summary.title)).toBeVisible();
    await expect(page.getByText(id.game.xpToast.amount.replace('{amount}', '10'))).toBeVisible();
    await expectNoHorizontalOverflow(page);
    test.info().annotations.push({
      type: 'screenshot',
      description: await capture(page, 'light-06-review-summary'),
    });

    // 60 (M5 learning) + 50 first Unbook + 10 daily review, plus any completed mission reward.
    const { missionXp } = await expectLedger(db, seed.userId, {
      module_read: { count: 1, amount: 20 },
      quiz_pass: { count: 1, amount: 30 },
      quiz_perfect: { count: 1, amount: 10 },
      first_unbook: { count: 1, amount: 50 },
      review_daily: { count: 1, amount: 10 },
    });
    expect(await readTotalXp(db, seed.userId)).toBe(120 + missionXp);
    expect(await readDueCardCount(db, seed.userId)).toBe(0);
  });
});
