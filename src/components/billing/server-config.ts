import 'server-only';

/**
 * Snap JS locations (official Midtrans domains). Chosen by `MIDTRANS_IS_PRODUCTION`;
 * sandbox is the default so a missing flag never points at production.
 */
export const SANDBOX_SNAP_JS = 'https://app.sandbox.midtrans.com/snap/snap.js';
export const PRODUCTION_SNAP_JS = 'https://app.midtrans.com/snap/snap.js';

export type SnapClientConfig = {
  /** `MIDTRANS_CLIENT_KEY`; `null` keeps the calm "pembayaran belum tersedia" state. */
  clientKey: string | null;
  /** Official Snap JS URL for the active environment. */
  snapUrl: string;
};

type MidtransEnv = { [key: string]: string | undefined };

export function getSnapClientConfig(env: MidtransEnv = process.env): SnapClientConfig {
  const clientKey = env.MIDTRANS_CLIENT_KEY?.trim();
  const snapUrl =
    env.MIDTRANS_IS_PRODUCTION?.trim() === 'true' ? PRODUCTION_SNAP_JS : SANDBOX_SNAP_JS;
  return { clientKey: clientKey ? clientKey : null, snapUrl };
}