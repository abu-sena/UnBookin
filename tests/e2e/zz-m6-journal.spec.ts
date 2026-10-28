import { expect, test, type Page } from '@playwright/test';

import id from '../../src/messages/id.json';
import { readJournalSeed, readLearningSeed, type ColorSchemeName } from './support/config';
import {
  openDb,
  readActionRow,
  readDomainProgress,
  readLedgerMap,
  readMissionXp,
  readReports,
  readTotalXp,
  readUserStats,
  waitForCondition,
  type Db,
} from './support/db';
import {
  ledgerDelta,
  providerRequestCount,
  readActionXpTypes,
  setProviderMode,
} from './support/journal';
import { capture, expectNoHorizontalOverflow, signInWithSeed } from './support/ui';

/**
 * M6 e2e: journal (Alur C), provider modes, timezone, foreign isolation.
 *
 * File name starts with `zz-` on purpose: Playwright runs files alphabetically
 * with one worker, and the M5 specs assert the EXACT per-type ledger of the
 * shared learner. This spec awards action XP to that same learner, so it must
 * run after them (smoke, dark-mode, learning-flow, review-flow).
 *
 * Progress / level-celebration browser assertions are intentionally pending
 * until the real game UI exists; see the `fixme` tests at the end.
 */

const copy = id.journal;
const WHAT =
  'Saya menulis tiga langkah konkret, menjalankannya bersama tim kecil selama sesi pagi, dan mencatat hasil tiap langkah dalam jurnal harian.';
const WHAT_REVISED = `${WHAT} Setelah umpan balik, saya menambahkan contoh nyata dan angka sebelum dan sesudah.`;
const RESULT =
  'Rapat berikutnya selesai dua puluh menit lebih cepat dan semua orang tahu tugasnya.';
const REFLECTION = 'Lain kali saya akan menyiapkan agenda tertulis sehari sebelumnya.';
const EVIDENCE = 'https://example.com/bukti';

function hydrationProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) {
      problems.push(message.text().slice(0, 200));
    }
  });
  page.on('pageerror', (error) => {
    if (/hydrat/i.test(error.message)) problems.push(error.message.slice(0, 200));
  });
  return problems;
}

function card(page: Page, title: string) {
  return page.getByRole('article').filter({ hasText: title });
}

async function missionXp(db: Db, userId: string): Promise<number> {
  return readMissionXp(db, userId);
}

for (const scheme of ['light', 'dark'] as ColorSchemeName[]) {
  test.describe.serial(`M6 Alur C journal (${scheme}, 375px, TZ browser Asia/Jakarta)`, () => {
    test.use({ colorScheme: scheme });
    let db: Db;

    test.beforeAll(() => {
      db = openDb();
    });

    test.afterAll(async () => {
      await setProviderMode('high').catch(() => undefined);
      await db.end();
    });

    test('home link, SSR/browser timezone agree, overdue extend keeps XP', async ({
      page,
      context,
    }) => {
      const learning = readLearningSeed();
      const journal = readJournalSeed();
      const extend = journal.actions[scheme].extend;
      const problems = hydrationProblems(page);
      await signInWithSeed(context, learning);

      await page.goto('/home');
      const homeLink = page.getByRole('link', { name: extend.title });
      await expect(homeLink).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await homeLink.click();
      await expect(page).toHaveURL(new RegExp(`/journal/${extend.id}$`));
      await expect(page.getByRole('heading', { level: 1, name: extend.title })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto('/journal');
      const extendCard = card(page, extend.title);
      await expect(extendCard).toBeVisible();
      // 15 Mar 17:30 UTC is already 16 Mar in Jakarta: SSR (TZ=UTC) must follow the profile zone.
      await expect(
        extendCard.getByText(copy.due.replace('{date}', journal.fixedDueText)),
      ).toBeVisible();
      await expect(extendCard.getByText(copy.overdue)).toBeVisible();
      await expect(extendCard.getByText(copy.overdueNote)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `${scheme}-10-journal-list`),
      });

      const xpBefore = await readTotalXp(db, learning.userId);
      const before = new Date();
      await extendCard.getByRole('button', { name: copy.actions.extend }).click();
      const row = await waitForCondition(
        () => readActionRow(db, extend.id),
        (value) => !!value?.due_at && value.due_at.getTime() > before.getTime(),
      );
      expect(row?.status).toBe('planned');
      const dueDelta = row!.due_at!.getTime() - before.getTime();
      expect(dueDelta).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
      expect(dueDelta).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
      await expect(extendCard.getByText(copy.overdue)).toHaveCount(0);
      expect(await readTotalXp(db, learning.userId)).toBe(xpBefore);
      expect(await readReports(db, extend.id)).toHaveLength(0);
      expect(problems).toEqual([]);
    });

    test('skip moves a separate action to Dilewati without XP loss', async ({ page, context }) => {
      const learning = readLearningSeed();
      const skip = readJournalSeed().actions[scheme].skip;
      await signInWithSeed(context, learning);
      await page.goto('/journal');

      const xpBefore = await readTotalXp(db, learning.userId);
      const skipCard = card(page, skip.title);
      await skipCard.getByRole('button', { name: copy.actions.skip, exact: true }).click();
      await expect(page.getByText(copy.skipDialog.title)).toBeVisible();
      await page.getByRole('button', { name: copy.skipDialog.confirm }).click();

      const row = await waitForCondition(
        () => readActionRow(db, skip.id),
        (value) => value?.status === 'skipped',
      );
      expect(row?.status).toBe('skipped');
      expect(await readTotalXp(db, learning.userId)).toBe(xpBefore);

      await page
        .getByRole('tab', { name: new RegExp(`^${copy.tabs.skipped} \\(\\d+\\)$`) })
        .click();
      await expect(page.getByRole('link', { name: skip.title })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test('report: invalid input, provider failure, low score, revision to verified', async ({
      page,
      context,
    }) => {
      const learning = readLearningSeed();
      const journal = readJournalSeed();
      const action = journal.actions[scheme].report;
      await signInWithSeed(context, learning);
      await page.goto(`/journal/${action.id}`);
      await expect(page.getByRole('heading', { level: 1, name: action.title })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const what = page.locator('#journal-what');
      const result = page.locator('#journal-result');
      const reflection = page.locator('#journal-reflection');
      const evidence = page.locator('#journal-evidence');
      const submit = page.getByRole('button', { name: copy.form.submit, exact: true });

      // 1. Invalid input is rejected in the form itself: no provider call, no report.
      const requestsBefore = await providerRequestCount();
      await what.fill('Terlalu pendek.');
      await evidence.fill('http://localhost/bukti');
      await submit.click();
      await expect(page.getByText(copy.form.whatMin)).toBeVisible();
      await expect(page.getByText(copy.form.required)).toBeVisible();
      await expect(page.getByText(copy.form.evidenceInvalid)).toBeVisible();
      expect(await providerRequestCount()).toBe(requestsBefore);
      expect(await readReports(db, action.id)).toHaveLength(0);

      // 2. Provider failure: safe message, values kept, nothing persisted.
      await setProviderMode('fail');
      await what.fill(WHAT);
      await result.fill(RESULT);
      await reflection.fill(REFLECTION);
      await evidence.fill(EVIDENCE);
      await submit.click();
      await expect(
        page.getByRole('alert').filter({ hasText: copy.form.gradingUnavailable }),
      ).toBeVisible();
      await expect(what).toHaveValue(WHAT);
      await expect(result).toHaveValue(RESULT);
      await expect(reflection).toHaveValue(REFLECTION);
      await expect(evidence).toHaveValue(EVIDENCE);
      expect(await readReports(db, action.id)).toHaveLength(0);
      expect(await readActionXpTypes(db, learning.userId, action.id)).toEqual([]);

      // 3. Low score: friendly feedback, no action XP, one revision left.
      await setProviderMode('low');
      const xpBeforeLow = await readTotalXp(db, learning.userId);
      const missionBeforeLow = await missionXp(db, learning.userId);
      await submit.click();
      const lowStatus = page.getByRole('status').filter({ hasText: copy.form.reviseTitle });
      await expect(lowStatus).toBeVisible();
      await expect(lowStatus.getByText(copy.form.scoreLabel.replace('{score}', '2'))).toBeVisible();
      await expect(lowStatus.getByText('Langkahmu sudah mulai')).toBeVisible();
      await expect(lowStatus.getByText(copy.form.revisionRemaining)).toBeVisible();
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `${scheme}-11-journal-low-feedback`),
      });
      const afterLow = await readReports(db, action.id);
      expect(afterLow).toHaveLength(1);
      expect(afterLow[0]).toMatchObject({ quality_score: 2, verified: false });
      expect((await readActionRow(db, action.id))?.status).toBe('planned');
      expect(await readActionXpTypes(db, learning.userId, action.id)).toEqual([]);
      // A low report may complete the weekly "apply" mission, but never grants action XP.
      const missionAfterLow = await missionXp(db, learning.userId);
      expect(await readTotalXp(db, learning.userId)).toBe(
        xpBeforeLow + (missionAfterLow - missionBeforeLow),
      );

      // 4. Revision with a high score: verified, exactly 50 + 40 once.
      await setProviderMode('high');
      const ledgerBefore = await readLedgerMap(db, learning.userId);
      const totalBefore = await readTotalXp(db, learning.userId);
      const missionBefore = await missionXp(db, learning.userId);
      await expect(page.getByRole('heading', { name: copy.form.revisionTitle })).toBeVisible();
      await what.fill(WHAT_REVISED);
      await page.getByRole('button', { name: copy.form.submitRevision }).click();
      const verified = page.getByRole('status').filter({ hasText: copy.form.verifiedTitle });
      await expect(verified).toBeVisible();
      await expect(verified.getByText(copy.form.scoreLabel.replace('{score}', '4'))).toBeVisible();
      await expect(
        page.getByText(id.game.xpToast.amount.replace('{amount}', '90')).first(),
      ).toBeVisible();
      await expect(page.locator('#journal-what')).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `${scheme}-12-journal-verified`),
      });

      const reports = await readReports(db, action.id);
      expect(reports).toHaveLength(2);
      expect(reports[0]).toMatchObject({ quality_score: 2, verified: false });
      expect(reports[1]).toMatchObject({
        quality_score: 4,
        verified: true,
        evidence_url: EVIDENCE,
      });
      expect(reports[1]!.reflection).toBe(REFLECTION);
      expect((await readActionRow(db, action.id))?.status).toBe('done');
      expect(await readActionXpTypes(db, learning.userId, action.id)).toEqual([
        'action_reflection',
        'action_verified',
      ]);

      const ledgerAfter = await readLedgerMap(db, learning.userId);
      const delta = ledgerDelta(ledgerBefore, ledgerAfter);
      const { weekly_mission: missionDelta, ...strict } = delta;
      expect(strict).toEqual({
        action_verified: { count: 1, amount: 50 },
        action_reflection: { count: 1, amount: 40 },
      });
      const missionGain = (await missionXp(db, learning.userId)) - missionBefore;
      expect(missionDelta?.amount ?? 0).toBe(missionGain);
      expect(await readTotalXp(db, learning.userId)).toBe(totalBefore + 90 + missionGain);

      // Persisted state: stats match the ledger, domain XP split by the 0.75/0.25 weights.
      const stats = await readUserStats(db, learning.userId);
      const ledgerTotal = Object.values(ledgerAfter).reduce((sum, item) => sum + item.amount, 0);
      expect(stats?.total_xp).toBe(ledgerTotal);
      const domains = await readDomainProgress(db, learning.userId);
      const byDomain = new Map(domains.map((row) => [row.domain_id, row]));
      for (const domainId of journal.domainIds.slice(0, 2)) {
        expect(byDomain.get(domainId)?.xp ?? 0).toBeGreaterThan(0);
        expect(byDomain.get(domainId)?.verified_actions ?? 0).toBeGreaterThanOrEqual(1);
      }

      // Reload: no duplicate XP, no third-submission UI, history readable.
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: action.title })).toBeVisible();
      await expect(page.locator('#journal-what')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Kirim/ })).toHaveCount(0);
      await expect(page.getByText(copy.detail.doneNote)).toBeVisible();
      await expect(page.getByRole('heading', { name: copy.detail.reportsTitle })).toBeVisible();
      await expect(page.getByRole('link', { name: EVIDENCE })).toBeVisible();
      expect(await readReports(db, action.id)).toHaveLength(2);
      expect(await readLedgerMap(db, learning.userId)).toEqual(ledgerAfter);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `${scheme}-13-journal-detail-reload`),
      });

      // Done tab lists the verified action and stays readable.
      await page.goto('/journal');
      await page.getByRole('tab', { name: new RegExp(`^${copy.tabs.done} \\(\\d+\\)$`) }).click();
      await expect(page.getByRole('link', { name: action.title })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `${scheme}-14-journal-done-tab`),
      });
    });
  });
}

test.describe('M6 journal isolation', () => {
  let db: Db;

  test.beforeAll(() => {
    db = openDb();
  });

  test.afterAll(async () => {
    await db.end();
  });

  test('a foreign user action id is not found and leaks nothing', async ({ page, context }) => {
    const learning = readLearningSeed();
    const journal = readJournalSeed();
    await signInWithSeed(context, learning);

    const before = await readActionRow(db, journal.foreignActionId);
    expect(before?.user_id).toBe(journal.foreignUserId);

    const response = await page.goto(`/journal/${journal.foreignActionId}`);
    // Streaming may already have sent 200; the generic not-found page is the real contract.
    const notFoundText = page.getByText(/404|could not be found|tidak ditemukan/i).first();
    if (response?.status() !== 404) await expect(notFoundText).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain(journal.foreignTitle);
    expect(html).not.toContain(journal.foreignModuleTitle);
    expect(html).not.toContain('Ringkasan rahasia asing');
    await expectNoHorizontalOverflow(page);

    await page.goto('/journal');
    await expect(page.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
    expect(await page.content()).not.toContain(journal.foreignTitle);

    // The foreign row is untouched.
    const after = await readActionRow(db, journal.foreignActionId);
    expect(after?.status).toBe('planned');
    expect(await readReports(db, journal.foreignActionId)).toHaveLength(0);
  });
});

/*
 * Pending until the real game UI (Progress page, level celebration, DomainDrawer)
 * is merged. No selectors are invented for it. Coordinator: replace each fixme
 * with a real assertion once /progress renders; DB-level domain/stats checks
 * already run in the report test above.
 */
test.describe('M6 game UI (pending)', () => {
  test.fixme('Progress shows XP, level, streak and three weekly missions (light/dark)', () => {
    // Pending: needs real /progress selectors, Home missions and screenshots.
  });
  test.fixme('Domain drawer opens, shows XP and module/action links, closes with Escape', () => {
    // Pending: needs real DomainDrawer selectors.
  });
  test.fixme('level celebration appears once after a threshold-crossing action and does not loop', () => {
    // Pending: needs real celebration UI; seed a legal ledger just below the threshold first.
  });
});
