import { Inngest } from 'inngest';

/**
 * Single Inngest client for the app. Safe to import in any server bundle: the
 * constructor only reads the event key lazily when an event is actually sent.
 * The ingest function registration and the `/api/inngest` serve route are part
 * of the follow-up integration task; no consumers are registered here.
 */
export const inngest = new Inngest({ id: 'unbookin' });
