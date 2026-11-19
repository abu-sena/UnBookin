import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RETURN_PATH_PREFIX,
  isPhoneWidth,
  isSafeReturnPath,
  readReturnPath,
  runSnapCheckout,
  storeReturnPath,
} from '@/components/billing/snap-checkout';

const ORDER = {
  orderId: 'UB-order-1',
  token: 'snap-token',
  redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token',
};
const CONFIG = {
  clientKey: 'client-key',
  snapUrl: 'https://app.sandbox.midtrans.com/snap/snap.js',
};

afterEach(() => {
  delete window.snap;
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('return path storage', () => {
  it('stores and reads the path keyed by order id', () => {
    storeReturnPath(ORDER.orderId, '/library?q=atomic');

    expect(window.sessionStorage.getItem(`${RETURN_PATH_PREFIX}${ORDER.orderId}`)).toBe(
      '/library?q=atomic',
    );
    expect(readReturnPath(ORDER.orderId)).toBe('/library?q=atomic');
  });

  it('ignores unsafe or missing values', () => {
    storeReturnPath(ORDER.orderId, 'https://evil.example');
    expect(readReturnPath(ORDER.orderId)).toBeNull();
  });
});

describe('runSnapCheckout', () => {
  it('uses the popup on desktop after loading Snap', async () => {
    const pay = vi.fn();
    window.snap = { pay };

    const result = await runSnapCheckout(ORDER, CONFIG, '/library', {
      width: 1024,
      loadScript: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toBe('popup');
    expect(pay).toHaveBeenCalledWith('snap-token');
    expect(readReturnPath(ORDER.orderId)).toBe('/library');
  });

  it('redirects to the Snap URL on phones without loading the popup', async () => {
    const navigate = vi.fn();
    const loadScript = vi.fn().mockResolvedValue(undefined);

    const result = await runSnapCheckout(ORDER, CONFIG, '/sources', {
      width: 375,
      navigate,
      loadScript,
    });

    expect(result).toBe('redirect');
    expect(navigate).toHaveBeenCalledWith(ORDER.redirectUrl);
    expect(loadScript).not.toHaveBeenCalled();
    expect(readReturnPath(ORDER.orderId)).toBe('/sources');
  });

  it('returns the calm unavailable state when the client key is missing', async () => {
    const loadScript = vi.fn().mockResolvedValue(undefined);

    const result = await runSnapCheckout(
      ORDER,
      { ...CONFIG, clientKey: null },
      '/library',
      { width: 1024, loadScript },
    );

    expect(result).toBe('unavailable');
    expect(loadScript).not.toHaveBeenCalled();
    expect(readReturnPath(ORDER.orderId)).toBeNull();
  });

  it('reports a script failure without crashing', async () => {
    const result = await runSnapCheckout(ORDER, CONFIG, '/library', {
      width: 1024,
      loadScript: vi.fn().mockRejectedValue(new Error('blocked')),
    });

    expect(result).toBe('scriptFailed');
  });

  it('treats < 768 px as a phone', () => {
    expect(isPhoneWidth(767)).toBe(true);
    expect(isPhoneWidth(768)).toBe(false);
  });

  it('only accepts same-site return paths', () => {
    expect(isSafeReturnPath('/unbook/abc?x=1')).toBe(true);
    expect(isSafeReturnPath('//evil.example')).toBe(false);
    expect(isSafeReturnPath('/\\evil.example')).toBe(false);
    expect(isSafeReturnPath('https://evil.example')).toBe(false);
    expect(isSafeReturnPath('/ok path')).toBe(false);
  });
});
