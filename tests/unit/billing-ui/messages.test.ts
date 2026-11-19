import { describe, expect, it } from 'vitest';
import messages from '@/messages/id.json';

const BILLING_KEYS = [
  'common.retry',
  'plans.free',
  'plans.pro',
  'plans.byok',
  'plans.monthly',
  'plans.yearly',
  'plans.perMonth',
  'plans.perYear',
  'plans.savings',
  'plans.current',
  'plans.selected',
  'plans.choose',
  'plans.upgrade',
  'plans.freeAlways',
  'paywall.title',
  'paywall.description',
  'paywall.pay',
  'paywall.processing',
  'paywall.missingClientKey',
  'paywall.secure',
  'langganan.title',
  'langganan.description',
  'langganan.currentPlan',
  'langganan.activeUntil',
  'langganan.daysLeft',
  'langganan.noActive',
  'langganan.chooseTitle',
  'langganan.chooseDescription',
  'langganan.renew',
  'langganan.historyTitle',
  'langganan.historyEmpty',
  'langganan.status.pending',
  'langganan.status.paid',
  'langganan.status.failed',
  'langganan.order.waitingTitle',
  'langganan.order.waitingBody',
  'langganan.order.paidTitle',
  'langganan.order.paidBody',
  'langganan.order.failedTitle',
  'langganan.order.failedBody',
  'langganan.order.timeoutTitle',
  'langganan.order.timeoutBody',
  'langganan.order.backTo',
  'langganan.order.retry',
  'langganan.errors.orderLimitReached',
  'langganan.errors.planUnavailable',
  'langganan.errors.paymentNotFound',
  'langganan.errors.midtransUnavailable',
  'langganan.errors.generic',
  'renewalBanner.title',
  'renewalBanner.cta',
  'devUi.title',
  'devUi.description',
  'devUi.planPicker',
  'devUi.paywall',
  'devUi.openPaywall',
  'devUi.statuses',
  'devUi.byok',
  'devUi.banner',
];

const BYOK_KEYS = [
  'title',
  'description',
  'back',
  'retry',
  'status.connected',
  'status.notConnected',
  'status.viaOauth',
  'status.viaManual',
  'status.lastVerified',
  'status.notVerified',
  'connectOpenRouter',
  'manualTitle',
  'manualDescription',
  'keyLabel',
  'keyPlaceholder',
  'saveKey',
  'saving',
  'retest',
  'retesting',
  'disconnect',
  'disconnecting',
  'disconnectTitle',
  'disconnectDescription',
  'disconnectConfirm',
  'cancel',
  'result.connected',
  'result.failed',
  'planNote',
  'modelNote',
  'errors.byokKeyRejected',
  'errors.byokKeyMissing',
  'errors.invalidInput',
  'errors.generic',
];

function read(namespace: object, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part];
    return undefined;
  }, namespace);
}

function assertStrings(namespace: object, keys: string[]) {
  for (const key of keys) {
    const value = read(namespace, key);
    expect(typeof value, `${key} must be a message string`).toBe('string');
    expect(String(value).trim().length, `${key} must not be empty`).toBeGreaterThan(0);
  }
}

describe('billing messages', () => {
  it('declares billing and byokSettings before mentor', () => {
    const order = Object.keys(messages);
    expect(order.indexOf('billing')).toBeLessThan(order.indexOf('mentor'));
    expect(order.indexOf('byokSettings')).toBeLessThan(order.indexOf('mentor'));
  });

  it('has every billing message key', () => {
    assertStrings(messages.billing, BILLING_KEYS);
  });

  it('has every byokSettings message key', () => {
    assertStrings(messages.byokSettings, BYOK_KEYS);
  });
});