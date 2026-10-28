import { expect, test, type Locator, type Page } from '@playwright/test';

import { domainRequirements, type DomainLevel } from '../../src/lib/game/domains';
import { levelProgress } from '../../src/lib/game/levels';
import id from '../../src/messages/id.json';
import { readJournalSeed, readLearningSeed, type ColorSchemeName } from './support/config';
import {
  LEVEL_GAP_MAX,
  addReadModulesWithXp,
  createFixtureUnbook,
  insertPlannedAction,
  openDb,
  planCelebrationSeed,
  readActionRow,
  readBadgeCatalogCount,
  readBadgeGrid,
  readDomainDetail,
  readDomainNames,
  readDomainProgress,
  readInterestDomains,
  readInterestName,
  readLedgerTotal,
  readStreakStats,
  readWeeklyMissions,
  type CelebrationSeedPlan,
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
 * The game UI blocks at the end (Progress/Home, DomainDrawer, level celebration)
 * assert DB-derived values through the accessible roles of the real components.
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
      const evidenceLinks = page.getByRole('link', { name: EVIDENCE });
      await expect(evidenceLinks).toHaveCount(2);
      for (const index of [0, 1]) {
        const link = evidenceLinks.nth(index);
        await expect(link).toHaveAttribute('href', EVIDENCE);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', /noopener/);
        await expect(link).toHaveAttribute('rel', /noreferrer/);
      }
      await expect(evidenceLinks.last()).toBeVisible();
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
 * M6 game UI. Selectors are the accessible roles/names rendered by the real
 * components (progress-overview, skill-tree, domain-detail, level-overview,
 * mission-list, level-up-celebration). All copy comes from src/messages/id.json
 * (resolved by path, so these keys must exist once the game UI is merged) and all
 * numbers from the DB / pure game rules, never from the rendered page.
 */
type Messages = { [key: string]: string | Messages };

function message(path: string): string {
  let node: string | Messages | undefined = id as unknown as Messages;
  for (const key of path.split('.')) {
    node = typeof node === 'object' ? node[key] : undefined;
  }
  if (typeof node !== 'string') throw new Error(`Missing message: ${path}`);
  return node;
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

/** Resolve the `{count, plural, other {# hari}}` messages used by the streak copy. */
function pluralDays(template: string, count: number): string {
  return template.replace(/\{count, plural, other \{# ([^}]*)\}\}/, `${count} $1`);
}

const numberFormat = new Intl.NumberFormat('id-ID');
const fmt = (value: number) => numberFormat.format(value);

function jakartaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** DB stats once the page's lazy reconcile has settled (stats equal the ledger sum). */
async function settledStats(db: Db, userId: string) {
  const settled = await waitForCondition(
    async () => ({
      stats: await readUserStats(db, userId),
      ledger: await readLedgerTotal(db, userId),
    }),
    (value) => value.stats?.total_xp === value.ledger,
  );
  expect(settled.stats?.total_xp, 'user_stats reconciled with the ledger').toBe(settled.ledger);
  const streak = await readStreakStats(db, userId);
  return { totalXp: settled.ledger, level: settled.stats!.level, streak: streak! };
}

async function expectLevelSummary(scope: Locator, totalXp: number): Promise<void> {
  const progress = levelProgress(totalXp);
  const ringName =
    progress.nextLevelXp === null
      ? new RegExp(`^Level ${progress.level}, `)
      : new RegExp(`^Level ${progress.level}, \\d+ persen menuju level ${progress.level + 1}$`);
  await expect(scope.getByRole('progressbar', { name: ringName })).toBeVisible();
  await expect(
    scope.getByText(fill(message('game.level.totalXp'), { xp: fmt(totalXp) }), { exact: true }),
  ).toBeVisible();
  const remaining =
    progress.nextLevelXp === null
      ? message('game.level.maxLevel')
      : fill(message('game.level.toNext'), {
          remaining: fmt(Math.max(0, progress.nextLevelXp - totalXp)),
          next: progress.level + 1,
        });
  await expect(scope.getByText(remaining, { exact: true })).toBeVisible();
}

for (const scheme of ['light', 'dark'] as ColorSchemeName[]) {
  test.describe(`M6 game UI: progress, home, domain drawer (${scheme}, 375px)`, () => {
    test.use({ colorScheme: scheme });
    let db: Db;

    test.beforeAll(() => {
      db = openDb();
    });

    test.afterAll(async () => {
      await db.end();
    });

    test('Progress and Home show DB-backed XP, level, streak, badges, domains and missions', async ({
      page,
      context,
    }) => {
      const learning = readLearningSeed();
      const journal = readJournalSeed();
      const problems = hydrationProblems(page);
      await signInWithSeed(context, learning);

      await page.goto('/progress');
      await expect(
        page.getByRole('heading', { level: 1, name: message('progress.title'), exact: true }),
      ).toBeVisible();
      const state = await settledStats(db, learning.userId);
      expect(state.totalXp).toBeGreaterThan(0);

      // Level + XP.
      const levelSection = page.getByRole('region', {
        name: message('progress.level.title'),
        exact: true,
      });
      await expect(levelSection).toBeVisible();
      await expectLevelSummary(levelSection, state.totalXp);

      // Streak: count, active flag, longest and freezes all follow the DB row.
      const activeToday = state.streak.last_active_date === jakartaToday();
      const streakSection = page.getByRole('region', {
        name: message('game.streak.title'),
        exact: true,
      });
      await expect(streakSection).toBeVisible();
      await expect(
        streakSection.getByText(
          pluralDays(message('game.streak.days'), state.streak.current_streak),
          {
            exact: true,
          },
        ),
      ).toBeVisible();
      await expect(
        streakSection.getByText(
          activeToday ? message('game.streak.activeToday') : message('game.streak.idleToday'),
        ),
      ).toBeVisible();
      await expect(
        streakSection.getByText(
          activeToday ? message('game.streak.idleToday') : message('game.streak.activeToday'),
        ),
      ).toHaveCount(0);
      await expect(
        streakSection.getByText(
          pluralDays(message('game.streak.longest'), state.streak.longest_streak),
        ),
      ).toBeVisible();
      await expect(
        streakSection.getByText(
          fill(message('game.streak.freezes'), { count: state.streak.streak_freezes }),
        ),
      ).toBeVisible();
      // Top bar flame: aria matches the same server counts, active or muted.
      const flameName = pluralDays(
        message(activeToday ? 'topBar.streakAriaActive' : 'topBar.streakAriaIdle'),
        state.streak.current_streak,
      );
      await expect(page.getByRole('link', { name: flameName, exact: true })).toBeVisible();
      await expect(
        page.getByRole('link', {
          name: pluralDays(
            message(activeToday ? 'topBar.streakAriaIdle' : 'topBar.streakAriaActive'),
            state.streak.current_streak,
          ),
          exact: true,
        }),
      ).toHaveCount(0);

      // Badge grid: first 12 catalog badges, earned vs locked from the DB.
      const catalogCount = await readBadgeCatalogCount(db);
      expect(catalogCount).toBeGreaterThanOrEqual(12);
      const grid = await readBadgeGrid(db, learning.userId, 12);
      expect(grid).toHaveLength(12);
      const badgeSection = page.getByRole('region', {
        name: message('progress.badges.title'),
        exact: true,
      });
      await expect(badgeSection.getByRole('listitem')).toHaveCount(12);
      const lockedPattern = new RegExp(escapeRegExp(message('progress.badges.locked')));
      await expect(badgeSection.getByRole('listitem', { name: lockedPattern })).toHaveCount(
        grid.filter((badge) => !badge.earned).length,
      );
      for (const badge of grid.filter((item) => item.earned)) {
        await expect(
          badgeSection.getByRole('listitem', { name: badge.name, exact: true }),
        ).toBeVisible();
      }

      // Skill tree: the fixture interest and all of its domains, with the Dreyfus level.
      const interestName = await readInterestName(db, journal.interestId);
      const interestDomains = await readInterestDomains(db, learning.userId, journal.interestId);
      expect(interestDomains.length).toBeGreaterThanOrEqual(2);
      const interestSection = page.getByRole('region', { name: interestName, exact: true });
      await expect(interestSection).toBeVisible();
      await expect(interestSection.getByRole('button')).toHaveCount(interestDomains.length);
      for (const domain of interestDomains) {
        await expect(
          interestSection.getByRole('button', {
            name: fill(message('progress.skills.domainAria'), {
              name: domain.name,
              level: message(`game.levels.${domain.level}`),
            }),
            exact: true,
          }),
        ).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `${scheme}-20-progress`),
      });

      // Home: level overview and exactly the three weekly missions from the DB.
      await page.goto('/home');
      const overview = page.getByRole('region', {
        name: message('game.homeOverview.title'),
        exact: true,
      });
      await expect(overview).toBeVisible();
      const homeState = await settledStats(db, learning.userId);
      await expectLevelSummary(overview, homeState.totalXp);
      const missions = await readWeeklyMissions(db, learning.userId);
      expect(missions).toHaveLength(3);
      await expect(overview.getByRole('listitem')).toHaveCount(3);
      for (const mission of missions) {
        const ring = fill(message('game.mission.progressAria'), {
          title: mission.title,
          progress: mission.progress,
          target: mission.target,
        });
        const item = overview.getByRole('listitem').filter({
          has: page.getByRole('progressbar', { name: ring, exact: true }),
        });
        await expect(item).toHaveCount(1);
        await expect(item).toContainText(mission.title);
        await expect(item).toContainText(
          fill(message('game.mission.progressText'), {
            progress: mission.progress,
            target: mission.target,
          }),
        );
        await expect(item).toContainText(
          fill(message('game.mission.reward'), { xp: mission.xp_reward }),
        );
        if (mission.completed) await expect(item).toContainText(message('game.mission.completed'));
        else await expect(item).not.toContainText(message('game.mission.completed'));
      }
      await expect(
        overview.getByRole('link', { name: message('game.homeOverview.viewProgress') }),
      ).toHaveAttribute('href', '/progress');
      await expect(
        overview.getByRole('link', { name: message('game.homeOverview.viewJournal') }),
      ).toHaveAttribute('href', '/journal');
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `${scheme}-21-home-game`),
      });
      expect(problems).toEqual([]);
    });

    test('Domain drawer shows XP, next-level gates and own module/action links, Escape closes', async ({
      page,
      context,
    }) => {
      const learning = readLearningSeed();
      const journal = readJournalSeed();
      const domainId = journal.domainIds[0]!;
      const names = await readDomainNames(db, [domainId]);
      const domainName = names.get(domainId);
      expect(domainName, 'fixture domain name').toBeTruthy();
      await signInWithSeed(context, learning);

      await page.goto('/progress');
      await expect(
        page.getByRole('heading', { level: 1, name: message('progress.title'), exact: true }),
      ).toBeVisible();
      await settledStats(db, learning.userId);
      const detail = await readDomainDetail(db, learning.userId, domainId);
      expect(detail.name).toBe(domainName);
      expect(detail.xp).toBeGreaterThan(0);

      const trigger = page.getByRole('button', {
        name: fill(message('progress.skills.domainAria'), {
          name: detail.name,
          level: message(`game.levels.${detail.level}`),
        }),
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: detail.name, exact: true });
      await expect(dialog).toBeVisible();

      // Level, XP, passed quizzes and verified actions from the DB.
      await expect(
        dialog.getByText(message(`game.levels.${detail.level}`), { exact: true }),
      ).toBeVisible();
      const stat = (label: string) =>
        dialog.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) });
      await expect(stat(message('progress.domain.xp'))).toContainText(fmt(detail.xp));
      await expect(stat(message('progress.domain.passedQuizzes'))).toContainText(
        String(detail.passedQuizzes),
      );
      await expect(stat(message('progress.domain.verifiedActions'))).toContainText(
        String(detail.verifiedActions),
      );

      // Exact next-level gates from the pure domain rules.
      const next = domainRequirements(detail.level as DomainLevel);
      if (next) {
        await expect(
          dialog.getByRole('heading', {
            name: fill(message('progress.domain.nextTitle'), {
              level: message(`game.levels.${next.nextLevel}`),
            }),
            exact: true,
          }),
        ).toBeVisible();
        const gates = [
          {
            label: fill(message('progress.domain.requirementXp'), {
              current: fmt(detail.xp),
              required: fmt(next.xp),
            }),
            met: detail.xp >= next.xp,
          },
          {
            label: fill(message('progress.domain.requirementQuizzes'), {
              current: detail.passedQuizzes,
              required: next.passedQuizzes,
            }),
            met: detail.passedQuizzes >= next.passedQuizzes,
          },
          {
            label: fill(message('progress.domain.requirementActions'), {
              current: detail.verifiedActions,
              required: next.verifiedActions,
            }),
            met: detail.verifiedActions >= next.verifiedActions,
          },
        ];
        for (const gate of gates) {
          const row = dialog.getByRole('listitem').filter({ hasText: gate.label });
          await expect(row).toHaveCount(1);
          await expect(row).toContainText(
            message(gate.met ? 'progress.domain.met' : 'progress.domain.unmet'),
          );
        }
      } else {
        await expect(dialog.getByText(message('progress.domain.nextMax'))).toBeVisible();
      }

      // Module links: only this learner's modules, correct hrefs.
      expect(detail.modules.length).toBeGreaterThan(0);
      expect(detail.modules.map((module) => module.id)).toContain(learning.moduleIds[1]);
      const moduleLinks = dialog.locator('a[href^="/unbook/"]');
      await expect(moduleLinks).toHaveCount(detail.modules.length);
      for (const linked of detail.modules) {
        expect(linked.unbookId).toBe(learning.unbookId);
        expect(learning.moduleIds).toContain(linked.id);
        await expect(dialog.getByRole('link', { name: linked.title, exact: true })).toHaveAttribute(
          'href',
          `/unbook/${linked.unbookId}/module/${linked.id}`,
        );
      }

      // Verified action links: this learner's reports only.
      const ownReport = journal.actions[scheme].report;
      expect(detail.actions.map((action) => action.id)).toContain(ownReport.id);
      const actionLinks = dialog.locator('a[href^="/journal/"]');
      await expect(actionLinks).toHaveCount(detail.actions.length);
      for (const action of detail.actions) {
        await expect(dialog.getByRole('link', { name: action.title, exact: true })).toHaveAttribute(
          'href',
          `/journal/${action.id}`,
        );
      }
      const html = await dialog.innerHTML();
      expect(html).not.toContain(journal.foreignActionId);
      expect(html).not.toContain(journal.foreignTitle);
      expect(html).not.toContain(journal.foreignModuleTitle);
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `${scheme}-22-domain-drawer`),
      });

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeVisible();
    });
  });
}

test.describe('M6 level celebration (light, 375px)', () => {
  test.use({ colorScheme: 'light' });
  let db: Db;

  test.beforeAll(() => {
    db = openDb();
  });

  test.afterAll(async () => {
    await setProviderMode('high').catch(() => undefined);
    await db.end();
  });

  test('level celebration appears once after a threshold-crossing action and does not loop', async ({
    page,
    context,
  }) => {
    const learning = readLearningSeed();
    const journal = readJournalSeed();
    const problems = hydrationProblems(page);
    await signInWithSeed(context, learning);
    await setProviderMode('high');

    // Own additional planned action on fixture module 2.
    const action = await insertPlannedAction(db, {
      userId: learning.userId,
      moduleId: learning.moduleIds[1]!,
      title: `Aksi perayaan level ${journal.runId}`,
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    const hostUnbookId = await createFixtureUnbook(db, {
      userId: learning.userId,
      interestId: journal.interestId,
      title: `Unbook perayaan ${journal.runId}`,
    });

    // Legal ledger only. Opening an app page reconciles missions/badges first, so
    // re-plan until the settled total sits 1..50 XP below the next level threshold.
    let plan: CelebrationSeedPlan = { threshold: 0, gap: 0, modules: 1 };
    for (let attempt = 0; attempt < 5 && plan.modules > 0; attempt += 1) {
      await page.goto('/home');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const settled = await settledStats(db, learning.userId);
      plan = planCelebrationSeed(settled.totalXp);
      if (plan.modules > 0) {
        await addReadModulesWithXp(db, {
          userId: learning.userId,
          unbookId: hostUnbookId,
          count: plan.modules,
        });
      }
    }
    expect(plan.modules, 'seed converged').toBe(0);
    expect(plan.gap).toBeGreaterThanOrEqual(1);
    expect(plan.gap).toBeLessThanOrEqual(LEVEL_GAP_MAX);

    // Provider's first snapshot is taken here, after all seeding: nothing to celebrate yet.
    await page.goto(`/journal/${action.id}`);
    await expect(page.getByRole('heading', { level: 1, name: action.title })).toBeVisible();
    const before = await settledStats(db, learning.userId);
    expect(before.totalXp).toBe(plan.threshold - plan.gap);
    const celebration = page.getByRole('dialog', {
      name: new RegExp(
        `^(${escapeRegExp(message('game.celebration.titleLevel'))}|${escapeRegExp(
          message('game.celebration.titleBoth'),
        )})$`,
      ),
    });
    await expect(celebration).toHaveCount(0);

    // Verified report with reflection: +50 +40 crosses the threshold (gap <= 50).
    await page.locator('#journal-what').fill(WHAT);
    await page.locator('#journal-result').fill(RESULT);
    await page.locator('#journal-reflection').fill(REFLECTION);
    await page.getByRole('button', { name: copy.form.submit, exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: copy.form.verifiedTitle }),
    ).toBeVisible();

    const after = await waitForCondition(
      () => settledStats(db, learning.userId),
      (value) => value.level > before.level,
    );
    expect(after.level).toBeGreaterThan(before.level);
    expect(after.totalXp).toBeGreaterThanOrEqual(plan.threshold);
    expect(await readActionXpTypes(db, learning.userId, action.id)).toEqual([
      'action_reflection',
      'action_verified',
    ]);

    await expect(celebration).toBeVisible();
    await expect(
      celebration.getByText(fill(message('game.celebration.levelLine'), { level: after.level }), {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      celebration.getByText(fill(message('game.celebration.xpLine'), { xp: fmt(after.totalXp) }), {
        exact: true,
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    test.info().annotations.push({
      type: 'screenshot',
      description: await capture(page, 'light-23-level-celebration'),
    });

    // Dismiss with the accessible CTA; it must not come back.
    await celebration.getByRole('button', { name: message('game.celebration.close') }).click();
    await expect(celebration).toHaveCount(0);

    for (const target of [null, '/progress', '/home'] as const) {
      if (target === null) await page.reload();
      else await page.goto(target);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(celebration).toHaveCount(0);
    }

    // The page still reports the same level; nothing was awarded twice.
    const final = await settledStats(db, learning.userId);
    expect(final.level).toBe(after.level);
    expect(final.totalXp).toBe(after.totalXp);
    expect(await readActionXpTypes(db, learning.userId, action.id)).toEqual([
      'action_reflection',
      'action_verified',
    ]);
    expect(problems).toEqual([]);
  });
});
