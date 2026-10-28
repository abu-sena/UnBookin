import { expect } from '@playwright/test';

import { E2E_PROVIDER_ORIGIN } from './config';
import {
  readCompletedMissionReward,
  readLedgerMap,
  readMissionXp,
  type Db,
  type LedgerMap,
} from './db';

export type ProviderMode = 'low' | 'high' | 'fail';

/** Switch the local fake provider (loopback only). Never touches the database. */
export async function setProviderMode(mode: ProviderMode): Promise<void> {
  const response = await fetch(`${E2E_PROVIDER_ORIGIN}/mode`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
  expect(response.status, 'provider mode endpoint').toBe(200);
}

/** Number of chat completions the fake provider has served so far. */
export async function providerRequestCount(): Promise<number> {
  const response = await fetch(`${E2E_PROVIDER_ORIGIN}/mode`);
  const body = (await response.json()) as { requests: number };
  return body.requests;
}

/** XP event types recorded for one action (refType 'action', refId = action id). */
export async function readActionXpTypes(
  db: Db,
  userId: string,
  actionId: string,
): Promise<string[]> {
  const rows = await db<{ type: string }[]>`
    select type from xp_events
    where user_id = ${userId} and ref_type = 'action' and ref_id = ${actionId}
    order by type asc
  `;
  return rows.map((row) => row.type);
}

/**
 * Compare the full per-type ledger against an expected map. Weekly mission
 * rewards are template-dependent (hashed per user/week), so they are excluded
 * from the strict map but cross-checked against completed missions in the DB.
 * Returns the mission XP so callers can fold it into exact totals.
 */
export async function expectLedger(
  db: Db,
  userId: string,
  expected: LedgerMap,
): Promise<{ missionXp: number; ledger: LedgerMap }> {
  const ledger = await readLedgerMap(db, userId);
  const { weekly_mission: mission, ...rest } = ledger;
  expect(rest).toEqual(expected);
  const missionXp = await readMissionXp(db, userId);
  expect(missionXp).toBe(mission?.amount ?? 0);
  expect(missionXp, 'mission XP equals completed mission rewards').toBe(
    await readCompletedMissionReward(db, userId),
  );
  return { missionXp, ledger };
}

/** Per-type difference between two ledger snapshots (only non-zero entries). */
export function ledgerDelta(before: LedgerMap, after: LedgerMap): LedgerMap {
  const out: LedgerMap = {};
  for (const type of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const count = (after[type]?.count ?? 0) - (before[type]?.count ?? 0);
    const amount = (after[type]?.amount ?? 0) - (before[type]?.amount ?? 0);
    if (count !== 0 || amount !== 0) out[type] = { count, amount };
  }
  return out;
}
