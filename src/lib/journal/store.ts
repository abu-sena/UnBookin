import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { actionReports, actions, modules, unbooks } from '@/db/schema';
import { awardXp } from '@/lib/game/xp';
import { reconcileGame } from '@/lib/game/engine';
import {
  ACTION_REFLECTION,
  ACTION_VERIFIED,
  XP_EVENT_TYPES,
  XP_REF_TYPES,
} from '@/lib/game/xp-rules';
import { JournalError } from './errors';
import { gradeActionFeedback } from './grading';
import { loadReportSnapshot, reportSlot } from './queries';
import {
  assertJournalIdentity,
  submitActionReportInputSchema,
  updateActionStatusInputSchema,
  type JournalIdentity,
} from './schemas';
import type { JournalActionResult, SubmitActionReportResult } from './types';

/** E7 XP values, re-exported for callers that already used these names. */
export const ACTION_VERIFIED_XP = ACTION_VERIFIED;
export const ACTION_REFLECTION_XP = ACTION_REFLECTION;
const ACTION_EXTEND_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * E7-01: extend or skip one planned action owned by the session user. The row
 * is locked before the status check so two tabs cannot both transition it.
 * There is no penalty and no XP. A done action can never become planned.
 */
export async function updateActionStatus(
  identity: JournalIdentity,
  input: { actionId: string; operation: 'extend' | 'skip' },
): Promise<JournalActionResult> {
  assertJournalIdentity(identity);
  const parsed = updateActionStatusInputSchema.safeParse(input);
  if (!parsed.success) throw new JournalError('invalidInput');

  return db.transaction(async (tx) => {
    const [action] = await tx
      .select({
        id: actions.id,
        status: actions.status,
        dueAt: actions.dueAt,
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
      .for('update', { of: actions })
      .limit(1);
    if (!action) throw new JournalError('notFound');
    if (action.status !== 'planned') throw new JournalError('alreadyCompleted');

    if (parsed.data.operation === 'skip') {
      await tx
        .update(actions)
        .set({ status: 'skipped' })
        .where(and(eq(actions.id, action.id), eq(actions.userId, identity.userId)));
      return { actionId: action.id, status: 'skipped' as const, dueAt: action.dueAt };
    }

    const now = new Date();
    const base = action.dueAt && action.dueAt.getTime() > now.getTime() ? action.dueAt : now;
    const dueAt = new Date(base.getTime() + ACTION_EXTEND_DAYS * DAY_MS);
    await tx
      .update(actions)
      .set({ dueAt })
      .where(and(eq(actions.id, action.id), eq(actions.userId, identity.userId)));
    return { actionId: action.id, status: 'planned' as const, dueAt };
  });
}

function sameReportIds(
  current: readonly { id: string }[],
  snapshot: readonly { id: string }[],
): boolean {
  if (current.length !== snapshot.length) return false;
  return current.every((report, index) => report.id === snapshot[index]?.id);
}

/**
 * E7-02: submit (or revise once) an application report.
 *
 * The action/report snapshot is read before the external AI call. The AI runs
 * OUTSIDE every transaction; the write transaction then locks the same action
 * and rechecks the snapshot (status + report ids). A concurrent submission
 * makes this call fail with `conflict` instead of consuming the same slot.
 * A verified report, the action status and both XP events commit atomically.
 */
export async function submitActionReport(
  identity: JournalIdentity,
  input: {
    actionId: string;
    whatIDid: string;
    result: string;
    reflection?: string;
    evidenceUrl?: string;
  },
): Promise<SubmitActionReportResult> {
  assertJournalIdentity(identity);
  const parsed = submitActionReportInputSchema.safeParse(input);
  if (!parsed.success) throw new JournalError('invalidInput');
  const { actionId, whatIDid, result, evidenceUrl } = parsed.data;
  const reflection = parsed.data.reflection ?? '';

  const snapshot = await loadReportSnapshot(identity, actionId);
  if (snapshot.action.status !== 'planned') throw new JournalError('alreadyCompleted');
  const slot = reportSlot(snapshot.reports);
  if (slot === 'verified') throw new JournalError('alreadyCompleted');
  if (slot === 'exhausted') throw new JournalError('revisionLimit');

  const grade = await gradeActionFeedback(identity, {
    moduleTitle: snapshot.moduleTitle,
    moduleSummary: snapshot.moduleSummary,
    content: snapshot.content,
    whatIDid,
    result,
    reflection,
    evidenceUrl: evidenceUrl ?? null,
  });
  const verified = grade.qualityScore >= 3;

  return db.transaction(async (tx) => {
    const [action] = await tx
      .select({ id: actions.id, status: actions.status })
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
      .for('update', { of: actions })
      .limit(1);
    if (!action) throw new JournalError('notFound');

    const currentReports = await tx
      .select({ id: actionReports.id })
      .from(actionReports)
      .where(eq(actionReports.actionId, actionId))
      .orderBy(asc(actionReports.createdAt), asc(actionReports.id));

    if (
      action.status !== snapshot.action.status ||
      !sameReportIds(currentReports, snapshot.reports)
    ) {
      throw new JournalError('conflict');
    }

    const [report] = await tx
      .insert(actionReports)
      .values({
        actionId,
        whatIDid,
        result,
        reflection,
        evidenceUrl: evidenceUrl ?? null,
        aiFeedback: grade.feedback,
        qualityScore: grade.qualityScore,
        verified,
      })
      .returning({ id: actionReports.id, createdAt: actionReports.createdAt });
    if (!report) throw new JournalError('unexpected');

    let xpAwarded = 0;
    if (verified) {
      await tx
        .update(actions)
        .set({ status: 'done' })
        .where(and(eq(actions.id, actionId), eq(actions.userId, identity.userId)));

      const verifiedXp = await awardXp(tx, {
        userId: identity.userId,
        type: XP_EVENT_TYPES.ACTION_VERIFIED,
        amount: ACTION_VERIFIED_XP,
        refType: XP_REF_TYPES.ACTION,
        refId: actionId,
      });
      if (verifiedXp.awarded) xpAwarded += verifiedXp.amount;

      if (reflection.length > 0) {
        const reflectionXp = await awardXp(tx, {
          userId: identity.userId,
          type: XP_EVENT_TYPES.ACTION_REFLECTION,
          amount: ACTION_REFLECTION_XP,
          refType: XP_REF_TYPES.ACTION,
          refId: actionId,
        });
        if (reflectionXp.awarded) xpAwarded += reflectionXp.amount;
      }
    } else {
      // Reporting missions count every scored report (even a revision), so a
      // low score must still refresh the derived state immediately.
      await reconcileGame(tx, identity.userId);
    }

    return {
      reportId: report.id,
      qualityScore: grade.qualityScore,
      feedback: grade.feedback,
      verified,
      xpAwarded,
      canRevise: !verified && snapshot.reports.length + 1 < 2,
    };
  });
}
