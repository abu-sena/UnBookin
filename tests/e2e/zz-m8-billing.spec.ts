import { expect, test, type Locator, type Page } from '@playwright/test';

import id from '../../src/messages/id.json';
import { readJournalSeed, readLearningSeed, type ColorSchemeName } from './support/config';
import {
  E2E_BYOK_LAST4,
  E2E_FIXTURE_BYOK_KEY,
  E2E_INVALID_BYOK_KEY,
  E2E_MIDTRANS_SERVER_KEY,
  deleteOrder,
  insertForeignOrder,
  midtransGross,
  readByokRow,
  readLatestAiCall,
  readPayments,
  readPlan,
  readProviderAuth,
  readSubscriptions,
  resetBilling,
  sendSignedNotification,
  setLearnerPlan,
  setProviderMode,
} from './support/billing';
import { openDb, waitForCondition, type Db } from './support/db';
import {
  clearMentorThreads,
  readFreeMentorLimit,
  readMentorUsage,
  setMentorUsage,
} from './support/mentor';
import { capture, expectNoHorizontalOverflow, signInWithSeed } from './support/ui';

/**
 * M8 e2e: Midtrans checkout/activation, server-to-server status, idempotent
 * notifications, renewal banner, BYOK OAuth/manual/disconnect, and isolation,
 * at 375 px in light and dark. Runs last (`zz-`) because it writes billing rows.
 *
 * All copy comes from `src/messages/id.json`; prices and limits come from the
 * local test database. The fake provider is loopback only and every Midtrans
 * host is blocked, so no real payment is ever attempted.
 */

const billingCopy = id.billing;
const byokCopy = id.byokSettings;
const mentorCopy = id.mentor;
const QUESTION = 'What is the first task of a leader?';
const ANSWER_MAIN = 'Pemimpin terbaik membangun sistem';

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentorSheet(page: Page): Locator {
  return page
    .getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: mentorCopy.close, exact: true }) });
}

async function openMentor(page: Page, unbookId: string): Promise<Locator> {
  await page.goto(`/unbook/${unbookId}`);
  const button = page.getByRole('button', { name: mentorCopy.button, exact: true });
  await expect(button).toBeVisible();
  await button.click();
  const sheet = mentorSheet(page);
  await expect(sheet).toBeVisible();
  return sheet;
}

async function sendQuestion(page: Page, sheet: Locator, question: string): Promise<void> {
  const input = sheet.getByRole('textbox', { name: mentorCopy.placeholder });
  await expect(input).toBeEnabled();
  await input.fill(question);
  await sheet.getByRole('button', { name: mentorCopy.send, exact: true }).click();
}

/** No request may reach a real Midtrans host; loopback fake uses 127.0.0.1. */
async function blockMidtrans(page: Page): Promise<void> {
  await page.route(/https?:\/\/[^/]*midtrans\.com\//i, (route) => route.abort());
}

function orderIdFrom(page: Page): string {
  const order = new URL(page.url()).searchParams.get('order');
  expect(order, 'order id in the return URL').toBeTruthy();
  return order!;
}

/**
 * The paywall can be nested in the mentor drawer, where the pay button sits
 * below a transformed/scroll-locked sheet and Playwright refuses to scroll it
 * into view. Dispatch the DOM click instead; React handles it identically.
 */
async function payAndReturn(page: Page, button: Locator): Promise<string> {
  await expect(button).toBeEnabled();
  await Promise.all([
    page.waitForURL(/\/settings\/langganan\?order=/, { timeout: 30_000 }),
    button.evaluate((element) => (element as HTMLElement).click()),
  ]);
  return orderIdFrom(page);
}

for (const scheme of ['light', 'dark'] as ColorSchemeName[]) {
  test.describe.serial(`M8 billing (${scheme}, 375px)`, () => {
    test.use({ colorScheme: scheme });
    let db: Db;
    let userId: string;
    let unbookId: string;
    let freeLimit: number;
    let proPlan: Awaited<ReturnType<typeof readPlan>>;

    test.beforeAll(async () => {
      db = openDb();
      const learning = readLearningSeed();
      userId = learning.userId;
      unbookId = learning.unbookId;
      await resetBilling(db, userId);
      await clearMentorThreads(db, userId);
      freeLimit = await readFreeMentorLimit(db);
      await setMentorUsage(db, userId, freeLimit);
      proPlan = await readPlan(db, 'pro_monthly');
      await setProviderMode('midtrans-pending');
    });

    test.afterAll(async () => {
      await setProviderMode('mentor-cite').catch(() => undefined);
      await db.end();
    });

    test('quota empty upgrades to Pro via signed settlement and returns to the mentor', async ({
      page,
      context,
    }) => {
      await blockMidtrans(page);
      await signInWithSeed(context, readLearningSeed());
      const sheet = await openMentor(page, unbookId);
      await expect(sheet.getByText(mentorCopy.quotaEmpty)).toBeVisible({ timeout: 20_000 });
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-01-quota-empty`);

      await sheet.getByRole('button', { name: billingCopy.plans.upgrade }).click();
      const paywall = page.getByRole('dialog').filter({ hasText: billingCopy.paywall.title });
      await expect(paywall).toBeVisible();
      const proChoice = paywall.locator('#paywall-plan-pro');
      await expect(proChoice).toBeVisible({ timeout: 15_000 });
      await proChoice.click();
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-02-paywall`);

      const orderId = await payAndReturn(
        page,
        paywall.getByRole('button', { name: billingCopy.paywall.pay }),
      );
      const panel = page.locator('[data-phase]');
      await expect(panel).toBeVisible();
      await expect(panel.getByText(billingCopy.langganan.order.waitingTitle)).toBeVisible();
      const pendingPayment = (await readPayments(db, userId)).find(
        (row) => row.order_id === orderId,
      );
      expect(pendingPayment?.status).toBe('pending');
      expect(await readSubscriptions(db, userId)).toHaveLength(0);
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-03-waiting`);

      const gross = midtransGross(proPlan.price_idr);
      expect(
        await sendSignedNotification({
          orderId,
          grossAmount: gross,
          transactionStatus: 'settlement',
          fraudStatus: 'accept',
        }),
      ).toBe(200);

      await expect(panel).toHaveAttribute('data-phase', 'paid', { timeout: 20_000 });
      await expect(panel.getByText(billingCopy.langganan.order.paidTitle)).toBeVisible();
      await expect(
        panel.getByText(new RegExp(`${escapeRegExp(proPlan.name)} aktif sampai`)),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-04-paid`);

      const subscriptions = await readSubscriptions(db, userId);
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0]?.plan_code).toBe('pro_monthly');
      const paidPayment = (await readPayments(db, userId)).find(
        (row) => row.order_id === orderId,
      );
      expect(paidPayment?.status).toBe('paid');

      const backLink = panel.getByRole('link', {
        name: fill(billingCopy.langganan.order.backTo, { path: `/unbook/${unbookId}` }),
      });
      await Promise.all([page.waitForURL(`**/unbook/${unbookId}`), backLink.click()]);
      await page.getByRole('button', { name: mentorCopy.button, exact: true }).click();
      const reopened = mentorSheet(page);
      await expect(reopened).toBeVisible();
      const proLimit = proPlan.limits.mentorMessagesPerMonth ?? 0;
      await expect(
        reopened.getByText(fill(mentorCopy.quota, { remaining: proLimit - freeLimit })),
      ).toBeVisible({ timeout: 20_000 });
      await expect(reopened.getByText(mentorCopy.quotaEmpty)).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-05-mentor-after-upgrade`);
    });

    test('a second order settles from the status poll alone', async ({ page, context }) => {
      await blockMidtrans(page);
      await setProviderMode('midtrans-settle');
      await signInWithSeed(context, readLearningSeed());
      await page.goto('/settings/langganan');
      const renew = page.getByRole('button', { name: billingCopy.langganan.renew });
      await expect(renew).toBeVisible();
      const orderId = await payAndReturn(page, renew);
      const panel = page.locator('[data-phase]');
      await expect(panel).toHaveAttribute('data-phase', 'paid', { timeout: 25_000 });
      await expect(panel.getByText(billingCopy.langganan.order.paidTitle)).toBeVisible();
      const payment = (await readPayments(db, userId)).find((row) => row.order_id === orderId);
      expect(payment?.status).toBe('paid');
      const subscriptions = await readSubscriptions(db, userId);
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0]?.plan_code).toBe('pro_monthly');
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-06-status-api-paid`);
      await setProviderMode('midtrans-pending');
    });

    test('duplicate settlement is idempotent and expire never downgrades a paid order', async ({
      page,
      context,
    }) => {
      await blockMidtrans(page);
      await resetBilling(db, userId);
      await setProviderMode('midtrans-pending');
      await signInWithSeed(context, readLearningSeed());
      await page.goto('/settings/langganan');
      const pay = page.getByRole('button', { name: billingCopy.paywall.pay });
      await expect(pay).toBeEnabled();
      const orderId = await payAndReturn(page, pay);
      const panel = page.locator('[data-phase]');
      await expect(panel.getByText(billingCopy.langganan.order.waitingTitle)).toBeVisible();
      const gross = midtransGross(proPlan.price_idr);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(
          await sendSignedNotification({
            orderId,
            grossAmount: gross,
            transactionStatus: 'settlement',
            fraudStatus: 'accept',
          }),
        ).toBe(200);
      }
      await expect
        .poll(async () => (await readPayments(db, userId)).find((r) => r.order_id === orderId)?.status)
        .toBe('paid');
      expect(await readSubscriptions(db, userId)).toHaveLength(1);

      expect(
        await sendSignedNotification({ orderId, grossAmount: gross, transactionStatus: 'expire' }),
      ).toBe(200);
      const afterExpire = (await readPayments(db, userId)).find((r) => r.order_id === orderId);
      expect(afterExpire?.status).toBe('paid');
      const subscriptions = await readSubscriptions(db, userId);
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0]?.status).toBe('active');
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-07-duplicate-settlement`);
    });

    test('bad signature is rejected and an amount mismatch never activates a plan', async ({
      page,
      context,
    }) => {
      await blockMidtrans(page);
      await resetBilling(db, userId);
      await setProviderMode('midtrans-pending');
      await signInWithSeed(context, readLearningSeed());
      await page.goto('/settings/langganan');
      const pay = page.getByRole('button', { name: billingCopy.paywall.pay });
      const orderId = await payAndReturn(page, pay);
      const gross = midtransGross(proPlan.price_idr);

      expect(
        await sendSignedNotification({
          orderId,
          grossAmount: gross,
          transactionStatus: 'settlement',
          fraudStatus: 'accept',
          serverKey: `${E2E_MIDTRANS_SERVER_KEY}-wrong`,
        }),
      ).toBe(401);
      expect(
        (await readPayments(db, userId)).find((row) => row.order_id === orderId)?.status,
      ).toBe('pending');
      expect(await readSubscriptions(db, userId)).toHaveLength(0);

      expect(
        await sendSignedNotification({
          orderId,
          grossAmount: midtransGross(proPlan.price_idr + 1000),
          transactionStatus: 'settlement',
          fraudStatus: 'accept',
        }),
      ).toBe(200);
      const mismatch = await waitForCondition(
        async () => (await readPayments(db, userId)).find((r) => r.order_id === orderId)?.status,
        (status) => status === 'amount_mismatch',
      );
      expect(mismatch).toBe('amount_mismatch');
      expect(await readSubscriptions(db, userId)).toHaveLength(0);
      await capture(page, `m8-${scheme}-08-amount-mismatch`);
    });

    test('status API with a bad signature leaves the order waiting', async ({ page, context }) => {
      await blockMidtrans(page);
      await resetBilling(db, userId);
      await setProviderMode('midtrans-bad-signature');
      await signInWithSeed(context, readLearningSeed());
      await page.goto('/settings/langganan');
      const pay = page.getByRole('button', { name: billingCopy.paywall.pay });
      const orderId = await payAndReturn(page, pay);
      const panel = page.locator('[data-phase]');
      await expect(panel.getByText(billingCopy.langganan.order.waitingTitle)).toBeVisible();
      await page.waitForTimeout(4_000);
      await expect(panel).toHaveAttribute('data-phase', 'waiting');
      expect(
        (await readPayments(db, userId)).find((row) => row.order_id === orderId)?.status,
      ).toBe('pending');
      expect(await readSubscriptions(db, userId)).toHaveLength(0);
      await capture(page, `m8-${scheme}-09-status-bad-signature`);
      await setProviderMode('midtrans-pending');
    });

    test('renewal banner shows at 5 days and not at 10', async ({ page, context }) => {
      await blockMidtrans(page);
      await resetBilling(db, userId);
      const day = 24 * 60 * 60 * 1000;
      await setLearnerPlan(db, userId, 'pro_monthly', new Date(Date.now() + 5 * day));
      await signInWithSeed(context, readLearningSeed());
      const bannerText = fill(billingCopy.renewalBanner.title, { days: 5 });

      await page.goto('/home');
      await expect(page.getByText(bannerText)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-10-home-banner`);
      await page.goto('/settings/langganan');
      await expect(page.getByText(bannerText)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-11-langganan-banner`);

      await setLearnerPlan(db, userId, 'pro_monthly', new Date(Date.now() + 10 * day));
      const bannerRegex = /Paketmu berakhir dalam/;
      await page.goto('/home');
      await expect(page.getByText(bannerRegex)).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-12-home-no-banner`);
      await page.goto('/settings/langganan');
      await expect(page.getByText(bannerRegex)).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-13-langganan-no-banner`);
    });

    test('OAuth connect, retest, and a mentor answer uses the BYOK key', async ({
      page,
      context,
    }) => {
      await blockMidtrans(page);
      await resetBilling(db, userId);
      await setLearnerPlan(
        db,
        userId,
        'byok_monthly',
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      );
      await setProviderMode('mentor-cite');
      await signInWithSeed(context, readLearningSeed());

      await page.goto('/settings/model-ai');
      await expect(page.getByText(byokCopy.status.notConnected)).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-14-byok-disconnected`);

      const authBefore = await readProviderAuth();
      await page.getByRole('link', { name: byokCopy.connectOpenRouter }).click();
      await page.waitForURL(/\/settings\/model-ai\?byok=connected/, { timeout: 30_000 });
      await expect(page.getByText(byokCopy.result.connected)).toBeVisible();
      await expect(
        page.getByText(fill(byokCopy.status.connected, { last4: E2E_BYOK_LAST4 })),
      ).toBeVisible();
      await expect(page.getByText(byokCopy.status.viaOauth)).toBeVisible();
      const row = await readByokRow(db, userId);
      expect(row?.last4).toBe(E2E_BYOK_LAST4);
      expect(row?.connected_via).toBe('oauth');
      expect(row?.encrypted_key).not.toContain(E2E_FIXTURE_BYOK_KEY);
      expect(row?.verified_at).not.toBeNull();
      expect((await readProviderAuth()).keyChecks).toBeGreaterThan(authBefore.keyChecks);
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-15-byok-connected`);

      const retestBefore = await readProviderAuth();
      await page.getByRole('button', { name: byokCopy.retest }).click();
      await expect
        .poll(async () => (await readProviderAuth()).keyChecks)
        .toBeGreaterThan(retestBefore.keyChecks);
      await expect(page.getByText(/Terakhir diverifikasi/)).toBeVisible();
      await capture(page, `m8-${scheme}-16-byok-retest`);

      await clearMentorThreads(db, userId);
      await setMentorUsage(db, userId, 0);
      const chatBefore = await readProviderAuth();
      const sheet = await openMentor(page, unbookId);
      await sendQuestion(page, sheet, QUESTION);
      await expect(sheet.getByText(ANSWER_MAIN, { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect
        .poll(async () => (await readProviderAuth()).byokChats)
        .toBeGreaterThan(chatBefore.byokChats);
      const call = await waitForCondition(
        () => readLatestAiCall(db, userId, 'mentor_chat'),
        (value) => value?.byok === true,
      );
      expect(call?.byok, 'mentor used the BYOK key').toBe(true);
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-17-byok-mentor-answer`);
    });

    test('disconnect, missing BYOK key refunds the message, manual invalid is rejected', async ({
      page,
      context,
    }) => {
      await blockMidtrans(page);
      await signInWithSeed(context, readLearningSeed());
      await page.goto('/settings/model-ai');
      await expect(
        page.getByText(fill(byokCopy.status.connected, { last4: E2E_BYOK_LAST4 })),
      ).toBeVisible();
      await page.getByRole('button', { name: byokCopy.disconnect, exact: true }).click();
      const confirm = page.getByRole('dialog').filter({ hasText: byokCopy.disconnectTitle });
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: byokCopy.disconnectConfirm }).click();
      await expect(page.getByText(byokCopy.status.notConnected)).toBeVisible();
      expect(await readByokRow(db, userId)).toBeNull();
      await capture(page, `m8-${scheme}-18-byok-disconnected-again`);

      await setMentorUsage(db, userId, 10);
      const usageBefore = await readMentorUsage(db, userId);
      const authBefore = await readProviderAuth();
      const sheet = await openMentor(page, unbookId);
      await sendQuestion(page, sheet, QUESTION);
      await expect(sheet.getByText(mentorCopy.errors.byokKeyMissing)).toBeVisible({
        timeout: 20_000,
      });
      await expect.poll(async () => readMentorUsage(db, userId)).toBe(usageBefore);
      expect((await readProviderAuth()).platformChats).toBe(authBefore.platformChats);
      await capture(page, `m8-${scheme}-19-byok-missing-refund`);

      await page.goto('/settings/model-ai');
      const input = page.locator('#byok-manual-key');
      await input.fill(E2E_INVALID_BYOK_KEY);
      await page.getByRole('button', { name: byokCopy.saveKey }).click();
      await expect(page.getByText(byokCopy.errors.byokKeyRejected)).toBeVisible();
      await expect(input).toHaveValue('');
      expect(await readByokRow(db, userId)).toBeNull();
      await expectNoHorizontalOverflow(page);
      await capture(page, `m8-${scheme}-20-manual-invalid`);
    });

    test('a foreign order never leaks and a wrong OAuth state fails safely', async ({
      page,
      context,
    }) => {
      await blockMidtrans(page);
      const learning = readLearningSeed();
      const foreignOrder = `m8-e2e-foreign-${scheme}-${Date.now()}`;
      await insertForeignOrder(db, {
        userId: readJournalSeed().foreignUserId,
        planCode: 'pro_monthly',
        orderId: foreignOrder,
        amountIdr: 987_654,
      });
      try {
        await signInWithSeed(context, learning);
        await page.goto(`/settings/langganan?order=${foreignOrder}`);
        const panel = page.locator('[data-phase]');
        await expect(panel).toBeVisible();
        await page.waitForTimeout(4_000);
        await expect(panel).not.toHaveAttribute('data-phase', 'paid');
        expect(
          (await readPayments(db, userId)).find((row) => row.order_id === foreignOrder),
        ).toBeUndefined();
        const body = (await page.locator('body').textContent()) ?? '';
        expect(body).not.toContain('987.654');
        expect(body).not.toContain('987654');

        const started = await context.request.get('/api/byok/start', { maxRedirects: 0 });
        expect([302, 303]).toContain(started.status());
        const cookie = (await context.cookies()).find((entry) => entry.name === 'ub_byok_oauth');
        expect(cookie, 'OAuth cookie set before callback').toBeTruthy();
        await page.goto('/api/byok/callback?state=wrong-state&code=whatever');
        await page.waitForURL(/\/settings\/model-ai\?byok=failed/, { timeout: 20_000 });
        await expect(page.getByText(byokCopy.result.failed)).toBeVisible();
        expect(await readByokRow(db, userId)).toBeNull();
        await expectNoHorizontalOverflow(page);
        await capture(page, `m8-${scheme}-21-foreign-order-and-bad-state`);
      } finally {
        await deleteOrder(db, foreignOrder);
      }
    });

    test.fixme(
      'an unknown order shows the not-found state instead of polling to timeout',
      async ({ page, context }) => {
        await blockMidtrans(page);
        await signInWithSeed(context, readLearningSeed());
        await page.goto(`/settings/langganan?order=m8-e2e-missing-${scheme}-${Date.now()}`);
        const panel = page.locator('[data-phase]');
        await expect(panel).toHaveAttribute('data-phase', 'failed', { timeout: 15_000 });
        await expect(panel.getByText(billingCopy.langganan.errors.paymentNotFound)).toBeVisible();
      },
    );
  });
}
