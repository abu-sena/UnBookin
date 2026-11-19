/** Client-side Snap checkout flow (E11-02 AC1, Alur D). */

declare global {
  interface Window {
    snap?: { pay: (token: string, options?: Record<string, unknown>) => void };
  }
}

export const RETURN_PATH_PREFIX = 'ub:checkout-return:';
export const DESKTOP_MIN_WIDTH = 768;

export type SnapClientConfig = { clientKey: string | null; snapUrl: string };

export type CheckoutOrder = { orderId: string; token: string; redirectUrl: string };

export type SnapCheckoutResult = 'popup' | 'redirect' | 'unavailable' | 'scriptFailed';

export type SnapCheckoutDeps = {
  loadScript?: () => Promise<void>;
  navigate?: (url: string) => void;
  width?: number;
};

/** Remember where the user was so the paid state can offer "Kembali ke …". */
export function storeReturnPath(orderId: string, path: string): void {
  if (!orderId || !path) return;
  try {
    window.sessionStorage.setItem(`${RETURN_PATH_PREFIX}${orderId}`, path);
  } catch {
    // Storage can be blocked; checkout must still work.
  }
}

export function readReturnPath(orderId: string): string | null {
  if (!orderId) return null;
  try {
    const value = window.sessionStorage.getItem(`${RETURN_PATH_PREFIX}${orderId}`);
    return value && isSafeReturnPath(value) ? value : null;
  } catch {
    return null;
  }
}

/** Same-origin app paths only: `//host` and `/\host` are protocol-relative and would leave the site. */
export function isSafeReturnPath(value: string): boolean {
  return /^\/(?![/\\])[^\s]*$/.test(value);
}

export function isPhoneWidth(width: number): boolean {
  return width < DESKTOP_MIN_WIDTH;
}

/** Inject Snap JS only when a payment starts, with the server-provided client key. */
export function loadSnapScript(
  snapUrl: string,
  clientKey: string,
  doc: Document = document,
): Promise<void> {
  if (typeof window !== 'undefined' && window.snap?.pay) return Promise.resolve();

  const existing = doc.querySelector<HTMLScriptElement>('script[data-midtrans-snap="true"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('snapScriptFailed')), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = snapUrl;
    script.async = true;
    script.dataset.midtransSnap = 'true';
    script.dataset.clientKey = clientKey;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('snapScriptFailed')), {
      once: true,
    });
    doc.head.appendChild(script);
  });
}

/**
 * Desktop uses the Snap popup; phones (< 768 px) follow the redirect URL.
 * The browser redirect never activates anything by itself.
 */
export async function runSnapCheckout(
  order: CheckoutOrder,
  config: SnapClientConfig,
  returnPath: string,
  deps: SnapCheckoutDeps = {},
): Promise<SnapCheckoutResult> {
  const clientKey = config.clientKey;
  if (!clientKey) return 'unavailable';

  const width = deps.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1024);
  storeReturnPath(order.orderId, returnPath);

  if (isPhoneWidth(width)) {
    (deps.navigate ?? ((url: string) => window.location.assign(url)))(order.redirectUrl);
    return 'redirect';
  }

  try {
    const load = deps.loadScript ?? (() => loadSnapScript(config.snapUrl, clientKey));
    await load();
  } catch {
    return 'scriptFailed';
  }

  if (!window.snap?.pay) return 'scriptFailed';
  window.snap.pay(order.token);
  return 'popup';
}