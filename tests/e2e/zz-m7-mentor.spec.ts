import { expect, test, type Locator, type Page } from '@playwright/test';

import id from '../../src/messages/id.json';
import {
  E2E_BASE_URL,
  readJournalSeed,
  readLearningSeed,
  type ColorSchemeName,
} from './support/config';
import { openDb, waitForCondition, type Db } from './support/db';
import {
  clearMentorThreads,
  createForeignMentorThread,
  mentorProviderRequestCount,
  readFreeMentorLimit,
  readMentorMessages,
  readMentorThreadId,
  readMentorUsage,
  removeForeignMentorThread,
  setMentorProviderMode,
  setMentorUsage,
} from './support/mentor';
import { capture, expectNoHorizontalOverflow, signInWithSeed } from './support/ui';

/**
 * M7 e2e: mentor sheet on the Unbook page and module reader, streamed cited
 * answers, stop/refund rules, quota-empty state and isolation, at 375 px in
 * light and dark. Runs last (`zz-`) because it writes to the shared learner.
 *
 * All copy is resolved from `src/messages/id.json`; all quota numbers and
 * limits come from the local test database.
 */

const copy = id.mentor;
const sourceCopy = id.module.source;

const QUESTION = 'What is the first task of a leader?';
const SLOW_QUESTION = 'How do leaders build trust through constraints?';
const SILENT_QUESTION = 'How does a leader lead change?';
const FAIL_QUESTION = 'What happens after the leader leaves the room?';
const ANSWER_MAIN = 'Pemimpin terbaik membangun sistem';
const OUTSIDE_TEXT = 'Secara umum, riset kepemimpinan mendukung hal ini.';
const SLOW_PARTIAL = 'Pemimpin terbaik membangun sistem.';

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every suggestion template with its placeholders widened, as one exact-name regex. */
function suggestionPattern(): RegExp {
  const alternatives = Object.values(copy.suggestions).map((template) =>
    template
      .split(/\{[^}]+\}/)
      .map(escapeRegExp)
      .join('.+'),
  );
  return new RegExp(`^(?:${alternatives.join('|')})$`);
}

/** Next Jakarta month start formatted the way the quota notice formats it. */
function nextResetLabel(): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month] = today.split('-').map(Number) as [number, number];
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const instant = new Date(
    `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+07:00`,
  );
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(instant);
}

function mentorSheet(page: Page): Locator {
  return page
    .getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: copy.close, exact: true }) });
}

async function openSheet(page: Page): Promise<Locator> {
  const button = page.getByRole('button', { name: copy.button, exact: true });
  await expect(button).toBeVisible();
  await button.click();
  const sheet = mentorSheet(page);
  await expect(sheet).toBeVisible();
  return sheet;
}

async function closeSheet(page: Page, sheet: Locator): Promise<void> {
  await sheet.getByRole('button', { name: copy.close, exact: true }).click();
  await expect(sheet).toHaveCount(0);
}

async function expectFullScreen(page: Page, sheet: Locator): Promise<void> {
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'sheet has a box').not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.height, 'sheet fills the viewport height').toBeGreaterThanOrEqual(
    viewport!.height - 2,
  );
  expect(box!.width, 'sheet fills the viewport width').toBeGreaterThanOrEqual(
    viewport!.width - 2,
  );
}

async function sendQuestion(page: Page, sheet: Locator, question: string): Promise<void> {
  const input = sheet.getByRole('textbox', { name: copy.placeholder });
  await expect(input).toBeEnabled();
  await input.fill(question);
  await sheet.getByRole('button', { name: copy.send, exact: true }).click();
}

async function expectNoRawMarkers(sheet: Locator): Promise<void> {
  const text = (await sheet.textContent()) ?? '';
  expect(text, 'no raw citation marker').not.toContain('[[');
  expect(text, 'no raw citation marker').not.toContain(']]');
  expect(text, 'no raw outside marker').not.toContain('<<');
  expect(text, 'no raw outside marker').not.toContain('luar-sumber');
}
for (const scheme of ['light', 'dark'] as ColorSchemeName[]) {
  test.describe.serial(`M7 mentor sheet (${scheme}, 375px)`, () => {
    test.use({ colorScheme: scheme });
    let db: Db;

    test.beforeAll(async () => {
      db = openDb();
      const learning = readLearningSeed();
      await clearMentorThreads(db, learning.userId);
      await setMentorUsage(db, learning.userId, 0);
    });

    test.afterAll(async () => {
      await setMentorProviderMode('mentor-cite').catch(() => undefined);
      await db.end();
    });

    test('Unbook and module entry points show the full-screen sheet and 3 suggestions', async ({
      page,
      context,
    }) => {
      const learning = readLearningSeed();
      const limit = await readFreeMentorLimit(db);
      const suggestions = suggestionPattern();
      await signInWithSeed(context, learning);

      await page.goto(`/unbook/${learning.unbookId}`);
      const unbookSheet = await openSheet(page);
      await expectFullScreen(page, unbookSheet);
      await expect(unbookSheet.getByRole('button', { name: suggestions })).toHaveCount(3);
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `m7-${scheme}-01-unbook-empty`),
      });
      await closeSheet(page, unbookSheet);

      const moduleId = learning.moduleIds[0]!;
      await page.goto(`/unbook/${learning.unbookId}/module/${moduleId}`);
      const sheet = await openSheet(page);
      await expectFullScreen(page, sheet);
      await expect(sheet.getByRole('button', { name: suggestions })).toHaveCount(3);
      await expectNoHorizontalOverflow(page);
      await expect(sheet.getByText(fill(copy.quota, { remaining: limit }))).toBeVisible();

      await setMentorProviderMode('mentor-cite');
      await sendQuestion(page, sheet, QUESTION);
      await expect(sheet.getByText(ANSWER_MAIN, { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      const outside = sheet.getByRole('group', { name: copy.outsideLabel });
      await expect(outside).toBeVisible();
      await expect(outside.getByText(OUTSIDE_TEXT, { exact: true })).toBeVisible();
      await expectNoRawMarkers(sheet);

      const chips = sheet.locator('button[aria-haspopup="dialog"]');
      await expect(chips.first()).toBeVisible();
      expect(await chips.count()).toBeGreaterThanOrEqual(2);
      await chips.first().click();
      const excerpt = page.getByRole('dialog', { name: sourceCopy.sheetTitle });
      await expect(excerpt).toBeVisible();
      const quote = excerpt.locator('blockquote');
      await expect(quote).toBeVisible();
      expect(((await quote.textContent()) ?? '').trim().length).toBeGreaterThan(10);
      await page.keyboard.press('Escape');
      await expect(excerpt).toHaveCount(0);

      await expect(
        sheet.getByText(fill(copy.quota, { remaining: limit - 1 })),
      ).toBeVisible();
      const used = await waitForCondition(
        () => readMentorUsage(db, learning.userId),
        (value) => value === 1,
      );
      expect(used, 'one mentor message spent').toBe(1);
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `m7-${scheme}-02-module-answer`),
      });

      await page.reload();
      const reopened = await openSheet(page);
      await expect(reopened.getByText(ANSWER_MAIN, { exact: true })).toBeVisible();
      await expect(reopened.locator('button[aria-haspopup="dialog"]').first()).toBeVisible();
      await expect(
        reopened.getByText(fill(copy.quota, { remaining: limit - 1 })),
      ).toBeVisible();
      await expectNoRawMarkers(reopened);
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `m7-${scheme}-03-history-after-reload`),
      });
    });

    test('Hentikan after text keeps the partial answer and spends the message', async ({
      page,
      context,
    }) => {
      const learning = readLearningSeed();
      await signInWithSeed(context, learning);
      await page.goto(`/unbook/${learning.unbookId}`);
      const sheet = await openSheet(page);
      const before = await readMentorUsage(db, learning.userId);
      const messagesBefore = (await readMentorMessages(db, learning.userId)).length;

      await setMentorProviderMode('mentor-slow');
      await sendQuestion(page, sheet, SLOW_QUESTION);
      await expect(sheet.getByText(SLOW_PARTIAL)).toBeVisible({ timeout: 20_000 });
      await sheet.getByRole('button', { name: copy.stop, exact: true }).click();
      await expect(sheet.getByText(copy.notices.stopped).first()).toBeVisible();
      await expect(sheet.getByText(SLOW_PARTIAL)).toBeVisible();

      const used = await waitForCondition(
        () => readMentorUsage(db, learning.userId),
        (value) => value === before + 1,
      );
      expect(used, 'stopped after text still spends the message').toBe(before + 1);
      const messages = await waitForCondition(
        () => readMentorMessages(db, learning.userId),
        (rows) =>
          rows.length === messagesBefore + 2 &&
          rows.some((row) => row.role === 'assistant' && row.content.includes(SLOW_PARTIAL)),
      );
      expect(messages.length).toBe(messagesBefore + 2);
      await expectNoRawMarkers(sheet);
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `m7-${scheme}-04-stopped-after-text`),
      });
    });

    test('Hentikan before text removes the turn and refunds the message', async ({
      page,
      context,
    }) => {
      const learning = readLearningSeed();
      await signInWithSeed(context, learning);
      await page.goto(`/unbook/${learning.unbookId}`);
      const sheet = await openSheet(page);
      const before = await readMentorUsage(db, learning.userId);
      const messagesBefore = (await readMentorMessages(db, learning.userId)).length;

      await setMentorProviderMode('mentor-silent');
      await sendQuestion(page, sheet, SILENT_QUESTION);
      await sheet.getByRole('button', { name: copy.stop, exact: true }).click();
      await expect(sheet.getByText(copy.notices.refunded).first()).toBeVisible();
      const input = sheet.getByRole('textbox', { name: copy.placeholder });
      await expect(input).toHaveValue(SILENT_QUESTION);
      await page.waitForTimeout(2_500);

      expect(await readMentorUsage(db, learning.userId)).toBe(before);
      const messages = await readMentorMessages(db, learning.userId);
      expect(messages.length).toBe(messagesBefore);
      expect(messages.some((row) => row.content === SILENT_QUESTION)).toBe(false);
      await expect(sheet.getByText(SILENT_QUESTION)).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `m7-${scheme}-05-stopped-before-text`),
      });
    });

    test('mentor-fail refunds, restores the input and leaves no orphan message', async ({
      page,
      context,
    }) => {
      const learning = readLearningSeed();
      await signInWithSeed(context, learning);
      await page.goto(`/unbook/${learning.unbookId}`);
      const sheet = await openSheet(page);
      const before = await readMentorUsage(db, learning.userId);
      const messagesBefore = (await readMentorMessages(db, learning.userId)).length;

      await setMentorProviderMode('mentor-fail');
      await sendQuestion(page, sheet, FAIL_QUESTION);
      await expect(sheet.getByText(copy.notices.refunded).first()).toBeVisible();
      const input = sheet.getByRole('textbox', { name: copy.placeholder });
      await expect(input).toHaveValue(FAIL_QUESTION);

      expect(await readMentorUsage(db, learning.userId)).toBe(before);
      const messages = await readMentorMessages(db, learning.userId);
      expect(messages.length).toBe(messagesBefore);
      expect(messages.some((row) => row.content === FAIL_QUESTION)).toBe(false);
      await expect(sheet.getByText(FAIL_QUESTION)).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      test.info().annotations.push({
        type: 'screenshot',
        description: await capture(page, `m7-${scheme}-06-refunded`),
      });
    });

    test('quota empty disables the input and offers the reset date and pricing link', async ({
      page,
      context,
    }) => {
      const learning = readLearningSeed();
      const limit = await readFreeMentorLimit(db);
      const before = await readMentorUsage(db, learning.userId);
      const messagesBefore = (await readMentorMessages(db, learning.userId)).length;
      await setMentorUsage(db, learning.userId, limit);
      try {
        await signInWithSeed(context, learning);
        await page.goto(`/unbook/${learning.unbookId}`);
        const sheet = await openSheet(page);

        await expect(sheet.getByRole('textbox', { name: copy.placeholder })).toBeDisabled();
        await expect(sheet.getByText(copy.quotaEmpty)).toBeVisible();
        await expect(
          sheet.getByText(fill(copy.quotaReset, { date: nextResetLabel() })),
        ).toBeVisible();
        const cta = sheet.getByRole('link', { name: copy.quotaCta });
        await expect(cta).toBeVisible();
        await expect(cta).toHaveAttribute('href', '/#harga-title');

        const requests = await mentorProviderRequestCount();
        await page.waitForTimeout(1_000);
        expect(await mentorProviderRequestCount(), 'no provider request while blocked').toBe(
          requests,
        );
        expect((await readMentorMessages(db, learning.userId)).length).toBe(messagesBefore);
        await expectNoHorizontalOverflow(page);
        test.info().annotations.push({
          type: 'screenshot',
          description: await capture(page, `m7-${scheme}-07-quota-empty`),
        });
      } finally {
        await setMentorUsage(db, learning.userId, before);
      }
    });
  });
}

test.describe('M7 mentor isolation', () => {
  let db: Db;

  test.beforeAll(() => {
    db = openDb();
  });

  test.afterAll(async () => {
    await setMentorProviderMode('mentor-cite').catch(() => undefined);
    await db.end();
  });

  test("another user's thread returns 404 JSON and a missing Origin returns 403", async ({
    page,
    context,
  }) => {
    const learning = readLearningSeed();
    const journal = readJournalSeed();
    await signInWithSeed(context, learning);
    await page.goto(`/unbook/${learning.unbookId}`);
    const sheet = await openSheet(page);
    await closeSheet(page, sheet);

    const ownThreadId = await readMentorThreadId(db, learning.userId);
    expect(ownThreadId, 'the learner owns a thread').not.toBeNull();
    const foreign = await createForeignMentorThread(db);
    const usageBefore = await readMentorUsage(db, learning.userId);
    const messagesBefore = (await readMentorMessages(db, learning.userId)).length;
    try {
      const response = await page.request.post(`/api/mentor/${foreign.threadId}`, {
        headers: { origin: E2E_BASE_URL },
        data: { message: 'halo' },
      });
      expect(response.status()).toBe(404);
      const body = await response.text();
      expect(body).toContain('notFound');
      expect(body).not.toContain(foreign.title);
      expect(body).not.toContain(journal.foreignTitle);
      expect(body).not.toContain(journal.foreignModuleTitle);
      expect(body).not.toContain('rahasia');

      const noOrigin = await page.request.post(`/api/mentor/${ownThreadId}`, {
        data: { message: 'halo' },
      });
      expect(noOrigin.status()).toBe(403);
      expect(await noOrigin.text()).toContain('invalidInput');

      expect(await readMentorUsage(db, learning.userId)).toBe(usageBefore);
      expect((await readMentorMessages(db, learning.userId)).length).toBe(messagesBefore);
    } finally {
      await removeForeignMentorThread(db, foreign.threadId);
    }
    await expectNoHorizontalOverflow(page);
    test.info().annotations.push({
      type: 'screenshot',
      description: await capture(page, 'm7-08-isolation'),
    });
  });
});
