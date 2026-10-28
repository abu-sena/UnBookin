import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { actionReports, actions, modules, profiles, unbooks } from '@/db/schema';
import { resolveTimeZone } from '@/lib/billing/source-quota';
import type { ModuleContent } from '@/lib/engine/module-content';
import { JournalError } from './errors';
import { assertJournalIdentity, journalActionIdSchema, type JournalIdentity } from './schemas';
import type { JournalAction, JournalActionStatus, JournalReport } from './types';

const actionIdInputSchema = z.strictObject({ actionId: journalActionIdSchema });

type ReportRow = {
  id: string;
  whatIDid: string;
  result: string;
  reflection: string;
  evidenceUrl: string | null;
  aiFeedback: string | null;
  qualityScore: number | null;
  verified: boolean;
  createdAt: Date;
};

type ActionRow = {
  id: string;
  moduleId: string;
  moduleTitle: string;
  unbookId: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  status: JournalActionStatus;
};

/** The report slot a planned action still has, if any. */
export type ReportSlot = 'initial' | 'revision' | 'verified' | 'exhausted';

export function reportSlot(reports: readonly { qualityScore: number | null }[]): ReportSlot {
  if (reports.length === 0) return 'initial';
  if (reports.some((report) => (report.qualityScore ?? 0) >= 3)) return 'verified';
  if (reports.length >= 2) return 'exhausted';
  return 'revision';
}

export function canReportNow(
  status: JournalActionStatus,
  reports: readonly { qualityScore: number | null }[],
): boolean {
  if (status !== 'planned') return false;
  return reportSlot(reports) === 'initial' || reportSlot(reports) === 'revision';
}

function toReport(row: ReportRow): JournalReport {
  return {
    id: row.id,
    whatIDid: row.whatIDid,
    result: row.result,
    reflection: row.reflection,
    evidenceUrl: row.evidenceUrl,
    aiFeedback: row.aiFeedback,
    qualityScore: row.qualityScore,
    verified: row.verified,
    createdAt: row.createdAt,
  };
}

function toAction(row: ActionRow, reports: ReportRow[]): JournalAction {
  return {
    id: row.id,
    moduleId: row.moduleId,
    moduleTitle: row.moduleTitle,
    unbookId: row.unbookId,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt,
    status: row.status,
    reports: reports.map(toReport),
    canReport: canReportNow(row.status, reports),
  };
}

async function reportsFor(actionIds: string[]): Promise<Map<string, ReportRow[]>> {
  const grouped = new Map<string, ReportRow[]>();
  if (actionIds.length === 0) return grouped;
  const rows = await db
    .select({
      actionId: actionReports.actionId,
      id: actionReports.id,
      whatIDid: actionReports.whatIDid,
      result: actionReports.result,
      reflection: actionReports.reflection,
      evidenceUrl: actionReports.evidenceUrl,
      aiFeedback: actionReports.aiFeedback,
      qualityScore: actionReports.qualityScore,
      verified: actionReports.verified,
      createdAt: actionReports.createdAt,
    })
    .from(actionReports)
    .where(inArray(actionReports.actionId, actionIds))
    .orderBy(asc(actionReports.createdAt), asc(actionReports.id));
  for (const row of rows) {
    const list = grouped.get(row.actionId) ?? [];
    list.push(row);
    grouped.set(row.actionId, list);
  }
  return grouped;
}

/**
 * E7-01: the caller's journal. Only actions from the caller's OWN ready Unbook
 * are returned, so another user's action or content can never leak. Planned
 * actions come first by due date (nulls last); completed/skipped follow with a
 * stable order. Dates stay `Date` objects until a UI boundary serializes them.
 */
export async function listJournal(identity: JournalIdentity): Promise<JournalAction[]> {
  assertJournalIdentity(identity);

  const rows = await db
    .select({
      id: actions.id,
      moduleId: actions.moduleId,
      moduleTitle: modules.title,
      unbookId: modules.unbookId,
      title: actions.title,
      description: actions.description,
      dueAt: actions.dueAt,
      status: actions.status,
    })
    .from(actions)
    .innerJoin(modules, eq(modules.id, actions.moduleId))
    .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
    .where(
      and(
        eq(actions.userId, identity.userId),
        eq(unbooks.userId, identity.userId),
        eq(unbooks.status, 'ready'),
      ),
    )
    .orderBy(
      sql`case when ${actions.status} = 'planned' then 0 else 1 end`,
      sql`${actions.dueAt} asc nulls last`,
      asc(actions.createdAt),
      asc(actions.id),
    );

  const reports = await reportsFor(rows.map((row) => row.id));
  return rows.map((row) => toAction(row, reports.get(row.id) ?? []));
}

/** E7-01/02: one journal detail, again scoped to the caller's own ready Unbook. */
export async function getJournalAction(
  identity: JournalIdentity,
  input: { actionId: string },
): Promise<JournalAction> {
  assertJournalIdentity(identity);
  const parsed = actionIdInputSchema.safeParse(input);
  if (!parsed.success) throw new JournalError('invalidInput');

  const [row] = await db
    .select({
      id: actions.id,
      moduleId: actions.moduleId,
      moduleTitle: modules.title,
      unbookId: modules.unbookId,
      title: actions.title,
      description: actions.description,
      dueAt: actions.dueAt,
      status: actions.status,
    })
    .from(actions)
    .innerJoin(modules, eq(modules.id, actions.moduleId))
    .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
    .where(
      and(
        eq(actions.id, parsed.data.actionId),
        eq(actions.userId, identity.userId),
        eq(unbooks.userId, identity.userId),
        eq(unbooks.status, 'ready'),
      ),
    )
    .limit(1);
  if (!row) throw new JournalError('notFound');

  const reports = await reportsFor([row.id]);
  return toAction(row, reports.get(row.id) ?? []);
}

/**
 * The caller's profile timezone (falls back to Asia/Jakarta when the profile
 * is missing or the stored zone is invalid). Pages pass it explicitly to the
 * journal UI so server and browser render identical dates.
 */
export async function getJournalTimeZone(identity: JournalIdentity): Promise<string> {
  assertJournalIdentity(identity);
  const [row] = await db
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.userId, identity.userId))
    .limit(1);
  return resolveTimeZone(row?.timezone);
}
export type ActionReportSnapshot = {
  action: {
    id: string;
    moduleId: string;
    title: string;
    status: JournalActionStatus;
  };
  moduleTitle: string;
  moduleSummary: string;
  content: ModuleContent | null;
  reports: { id: string; qualityScore: number | null }[];
};

/**
 * Read the action and its current reports BEFORE the external AI call. The
 * report ids are the concurrency snapshot rechecked inside the write
 * transaction; ownership and the ready Unbook are enforced here as well.
 */
export async function loadReportSnapshot(
  identity: JournalIdentity,
  actionId: string,
): Promise<ActionReportSnapshot> {
  const [row] = await db
    .select({
      id: actions.id,
      moduleId: actions.moduleId,
      title: actions.title,
      status: actions.status,
      moduleTitle: modules.title,
      moduleSummary: modules.summary,
      content: modules.content,
    })
    .from(actions)
    .innerJoin(modules, eq(modules.id, actions.moduleId))
    .innerJoin(unbooks, eq(unbooks.id, modules.unbookId))
    .where(
      and(
        eq(actions.id, actionId),
        eq(actions.userId, identity.userId),
        eq(unbooks.userId, identity.userId),
        eq(unbooks.status, 'ready'),
      ),
    )
    .limit(1);
  if (!row) throw new JournalError('notFound');

  const reports = await db
    .select({ id: actionReports.id, qualityScore: actionReports.qualityScore })
    .from(actionReports)
    .where(eq(actionReports.actionId, actionId))
    .orderBy(asc(actionReports.createdAt), asc(actionReports.id));

  return {
    action: {
      id: row.id,
      moduleId: row.moduleId,
      title: row.title,
      status: row.status,
    },
    moduleTitle: row.moduleTitle,
    moduleSummary: row.moduleSummary ?? '',
    content: row.content,
    reports,
  };
}
