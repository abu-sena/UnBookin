import { Inngest } from 'inngest';

/**
 * Single Inngest client for the app, shared by event sends and (later) the
 * `/api/inngest` serve route. `isDev` is decided EXPLICITLY here so the SDK
 * cannot fall back to its `INNGEST_DEV` environment behaviour: without this,
 * a production deployment that carries `INNGEST_DEV=true` would silently run
 * the client in dev mode (no signature verification, local Dev Server URL).
 *
 * - Production: `isDev: false` ALWAYS, regardless of any local flag. The serve
 *   integration therefore keeps signature verification enabled.
 * - Development: `isDev: true` only with the approved explicit local flag
 *   (`INNGEST_DEV=1` or `true`); anything else keeps dev mode off.
 */
const isProduction = process.env.NODE_ENV === 'production';
const devFlag = process.env.INNGEST_DEV?.trim().toLowerCase();
const approvedLocalDev = !isProduction && (devFlag === '1' || devFlag === 'true');

export const inngest = new Inngest({ id: 'unbookin', isDev: approvedLocalDev });
