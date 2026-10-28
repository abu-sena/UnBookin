/** E8-06: deterministic weekly mission selection and progress counting. */

import { localDate } from '../learning/leitner';

export const MISSION_TYPES = ['learn', 'review', 'apply'] as const;
export type MissionType = (typeof MISSION_TYPES)[number];

export const MIN_MISSION_REWARD = 30;
export const MAX_MISSION_REWARD = 60;

export type MissionTemplateInput = {
  id: string;
  slug: string;
  type: MissionType;
  target: number;
  xpReward: number;
};

export type MissionEvent = {
  type: string;
  createdAt: Date;
  refId: string;
};

/** XP event type that advances each mission type. */
const PROGRESS_EVENT: Record<MissionType, string> = {
  learn: 'module_read',
  review: 'review_daily',
  apply: 'action_verified',
};

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type DateKey = { year: number; month: number; day: number };

function parseDateKey(value: string): DateKey {
  if (typeof value !== 'string') throw new Error('invalidDate');
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) throw new Error('invalidDate');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error('invalidDate');
  }
  return { year, month, day };
}

function dayNumber({ year, month, day }: DateKey): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function weekday(value: number): number {
  return (((value + 4) % 7) + 7) % 7;
}

function assertMondayWeekStart(value: string): number {
  const start = dayNumber(parseDateKey(value));
  if (weekday(start) !== 1) throw new Error('invalidWeekStart');
  return start;
}

function isMissionType(value: string): value is MissionType {
  return (MISSION_TYPES as readonly string[]).includes(value);
}

function isValidTemplate(template: MissionTemplateInput): boolean {
  return (
    !!template &&
    typeof template.id === 'string' &&
    template.id.length > 0 &&
    typeof template.slug === 'string' &&
    template.slug.length > 0 &&
    typeof template.type === 'string' &&
    isMissionType(template.type) &&
    typeof template.target === 'number' &&
    Number.isInteger(template.target) &&
    template.target > 0 &&
    typeof template.xpReward === 'number' &&
    Number.isInteger(template.xpReward) &&
    template.xpReward >= MIN_MISSION_REWARD &&
    template.xpReward <= MAX_MISSION_REWARD
  );
}

/** FNV-1a 32-bit, stable across runs, platforms and Node versions. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function compareTemplates(a: MissionTemplateInput, b: MissionTemplateInput): number {
  if (a.slug !== b.slug) return a.slug < b.slug ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Pick exactly one valid template per mission type. The choice depends only on
 * user, week and type, so reruns for the same week are stable; output follows
 * the learn, review, apply order.
 */
export function selectWeeklyMissions(
  templates: readonly MissionTemplateInput[],
  userId: string,
  weekStart: string,
): MissionTemplateInput[] {
  parseDateKey(weekStart);
  if (typeof userId !== 'string' || userId.length === 0) throw new Error('invalidUserId');
  if (!Array.isArray(templates)) throw new Error('invalidTemplates');

  const byType = new Map<MissionType, Map<string, MissionTemplateInput>>();
  for (const type of MISSION_TYPES) byType.set(type, new Map());
  for (const template of templates) {
    if (!isValidTemplate(template)) continue;
    const bucket = byType.get(template.type)!;
    if (!bucket.has(template.id)) bucket.set(template.id, template);
  }

  const selected: MissionTemplateInput[] = [];
  for (const type of MISSION_TYPES) {
    const candidates = [...byType.get(type)!.values()].sort(compareTemplates);
    if (candidates.length === 0) continue;
    const index = hashString(`${userId}|${weekStart}|${type}`) % candidates.length;
    selected.push(candidates[index]!);
  }
  return selected;
}

/**
 * Distinct matching refs for the local Monday..Sunday week. Mission XP events
 * are not progress events, so they are never counted.
 */
export function missionProgress(
  type: MissionType,
  events: readonly MissionEvent[],
  weekStart: string,
  timeZone: string,
): number {
  if (typeof type !== 'string' || !isMissionType(type)) throw new Error('invalidMissionType');
  const start = assertMondayWeekStart(weekStart);
  const end = start + 6;
  if (!Array.isArray(events)) throw new Error('invalidEvents');

  const expected = PROGRESS_EVENT[type];
  const refs = new Set<string>();
  for (const event of events) {
    if (!event || event.type !== expected) continue;
    if (typeof event.refId !== 'string' || event.refId.length === 0) continue;
    if (!(event.createdAt instanceof Date) || Number.isNaN(event.createdAt.getTime())) continue;
    const day = dayNumber(parseDateKey(localDate(event.createdAt, timeZone)));
    if (day < start || day > end) continue;
    refs.add(event.refId);
  }
  return refs.size;
}
