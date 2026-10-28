import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gradeActionFeedback: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/db', async () => {
  const { fake } = await import('./fake-db');
  return { db: fake.db };
});
vi.mock('@/lib/journal/grading', () => ({
  gradeActionFeedback: mocks.gradeActionFeedback,
}));

import { actionReports, actions, userStats, xpEvents } from '@/db/schema';
import { JournalError } from '@/lib/journal/errors';
import { submitActionReport, updateActionStatus } from '@/lib/journal/store';
import { fake, renderSql } from './fake-db';

const USER = { userId: '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f' };
const USER_ID = USER.userId;
const ACTION_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const MODULE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const REPORT_ID = 'd4e5f6a7-8c9d-4eaf-b01f-3b4c5d6e7f8a';
const NOW = new Date('2026-10-28T08:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const INPUT = {
  actionId: ACTION_ID,
  whatIDid:
    'Saya memimpin rapat tim dengan agenda satu keputusan, membagi peran, dan mencatat hasil keputusan bersama seluruh tim.',
  result: 'Rapat selesai lima belas menit lebih cepat.',
  reflection: 'Saya akan menyiapkan agenda sehari sebelumnya.',
};

const SNAPSHOT_ACTION = {
  id: ACTION_ID,
  moduleId: MODULE_ID,
  title: 'Aksi A',
  status: 'planned' as const,
  moduleTitle: 'Modul A',
  moduleSummary: 'Ringkasan A',
  content: { layers: { practitioner: [] } },
};

function snapshotReport(id: string, qualityScore: number | null) {
  return { id, qualityScore };
}

function lockRow(status: 'planned' | 'done' | 'skipped' = 'planned') {
  return { id: ACTION_ID, status };
}

beforeEach(() => {
  fake.reset();
  mocks.gradeActionFeedback.mockReset();
  mocks.gradeActionFeedback.mockResolvedValue({
    qualityScore: 4,
    feedback: 'Aksi dan hasilnya sudah spesifik.',
  });
});

describe('updateActionStatus', () => {
  it('extends an overdue/undated action to now + 7 days after locking it', async () => {
    fake.results.push([{ id: ACTION_ID, status: 'planned', dueAt: new Date(Date.now() - DAY_MS) }]);

    const before = Date.now();
    const result = await updateActionStatus(USER, { actionId: ACTION_ID, operation: 'extend' });
    const after = Date.now();

    expect(result.status).toBe('planned');
    expect(result.dueAt).toBeInstanceOf(Date);
    expect(result.dueAt!.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY_MS);
    expect(result.dueAt!.getTime()).toBeLessThanOrEqual(after + 7 * DAY_MS);
    expect(fake.recorded.selects[0]?.locked).toBe(true);
    expect(fake.recorded.updates[0]).toMatchObject({ table: actions });
    expect(fake.recorded.updates[0]?.set).toEqual({ dueAt: result.dueAt });

    const where = renderSql(fake.recorded.selects[0]?.where);
    expect(where.sql).toMatch(/"actions"\."user_id" = \$\d+/);
    expect(where.sql).toMatch(/"unbooks"\."user_id" = \$\d+/);
    expect(where.params.filter((param) => param === USER_ID)).toHaveLength(2);
  });

  it('extends a future due date from the existing date, not from now', async () => {
    const existing = new Date(Date.now() + 2 * DAY_MS);
    fake.results.push([{ id: ACTION_ID, status: 'planned', dueAt: existing }]);

    const result = await updateActionStatus(USER, { actionId: ACTION_ID, operation: 'extend' });
    expect(result.dueAt?.getTime()).toBe(existing.getTime() + 7 * DAY_MS);
  });

  it('skips a planned action without awarding XP or touching its due date', async () => {
    const dueAt = new Date('2026-11-01T00:00:00.000Z');
    fake.results.push([{ id: ACTION_ID, status: 'planned', dueAt }]);

    const result = await updateActionStatus(USER, { actionId: ACTION_ID, operation: 'skip' });

    expect(result).toEqual({ actionId: ACTION_ID, status: 'skipped', dueAt });
    expect(fake.recorded.updates[0]?.set).toEqual({ status: 'skipped' });
    expect(fake.recorded.inserts.filter((entry) => entry.table === xpEvents)).toHaveLength(0);
  });

  it('never turns done/skipped back into planned', async () => {
    fake.results.push([{ id: ACTION_ID, status: 'done', dueAt: null }]);
    await expect(
      updateActionStatus(USER, { actionId: ACTION_ID, operation: 'extend' }),
    ).rejects.toMatchObject({ code: 'alreadyCompleted' });
    expect(fake.recorded.updates).toHaveLength(0);
  });

  it('is notFound for a foreign or missing action', async () => {
    fake.results.push([]);
    await expect(
      updateActionStatus(USER, { actionId: ACTION_ID, operation: 'extend' }),
    ).rejects.toMatchObject({ code: 'notFound' });
  });

  it('rejects malformed identities before opening a transaction', async () => {
    await expect(
      updateActionStatus({ userId: 'forged' } as never, {
        actionId: ACTION_ID,
        operation: 'extend',
      }),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    expect(fake.recorded.transactionCount).toBe(0);
  });
});

describe('submitActionReport', () => {
  it('stores a verified report, marks the action done and awards 50 + 40 XP atomically', async () => {
    fake.results.push(
      [SNAPSHOT_ACTION],
      [],
      [lockRow()],
      [],
      [{ id: REPORT_ID, createdAt: NOW }],
      [{ id: 'xp-verified' }],
      [{ id: 'xp-reflection' }],
    );
    mocks.gradeActionFeedback.mockImplementation(async () => {
      expect(fake.recorded.transactionCount).toBe(0);
      return { qualityScore: 4, feedback: 'Aksi dan hasilnya sudah spesifik.' };
    });

    const result = await submitActionReport(USER, {
      ...INPUT,
      evidenceUrl: 'https://example.com/bukti',
    });

    expect(result).toEqual({
      reportId: REPORT_ID,
      qualityScore: 4,
      feedback: 'Aksi dan hasilnya sudah spesifik.',
      verified: true,
      xpAwarded: 90,
      canRevise: false,
    });
    expect(fake.recorded.transactionCount).toBe(1);
    expect(mocks.gradeActionFeedback).toHaveBeenCalledTimes(1);

    const reportInsert = fake.recorded.inserts.find((entry) => entry.table === actionReports);
    expect(reportInsert?.values).toMatchObject({
      actionId: ACTION_ID,
      whatIDid: INPUT.whatIDid,
      result: INPUT.result,
      reflection: INPUT.reflection,
      evidenceUrl: 'https://example.com/bukti',
      qualityScore: 4,
      verified: true,
    });
    expect(fake.recorded.updates.find((entry) => entry.table === actions)?.set).toEqual({
      status: 'done',
    });

    const xpRows = fake.recorded.inserts
      .filter((entry) => entry.table === xpEvents)
      .map((entry) => entry.values as Record<string, unknown>);
    expect(xpRows).toEqual([
      expect.objectContaining({
        userId: USER_ID,
        type: 'action_verified',
        amount: 50,
        refType: 'action',
        refId: ACTION_ID,
      }),
      expect.objectContaining({
        userId: USER_ID,
        type: 'action_reflection',
        amount: 40,
        refType: 'action',
        refId: ACTION_ID,
      }),
    ]);
  });

  it('awards only 50 XP for verified reports with an empty reflection', async () => {
    fake.results.push(
      [SNAPSHOT_ACTION],
      [],
      [lockRow()],
      [],
      [{ id: REPORT_ID, createdAt: NOW }],
      [{ id: 'xp-verified' }],
    );
    mocks.gradeActionFeedback.mockResolvedValue({ qualityScore: 3, feedback: 'Sudah jelas.' });

    const result = await submitActionReport(USER, { ...INPUT, reflection: '   ' });

    expect(result.xpAwarded).toBe(50);
    expect(result.canRevise).toBe(false);
    const xpRows = fake.recorded.inserts.filter((entry) => entry.table === xpEvents);
    expect(xpRows).toHaveLength(1);
    expect(xpRows[0]?.values).toMatchObject({ type: 'action_verified', amount: 50 });
    const reportInsert = fake.recorded.inserts.find((entry) => entry.table === actionReports);
    expect(reportInsert?.values).toMatchObject({ reflection: '' });
  });

  it('keeps a low score as an unverified report, awards 0 XP and allows one revision', async () => {
    fake.results.push([SNAPSHOT_ACTION], [], [lockRow()], [], [{ id: REPORT_ID, createdAt: NOW }]);
    mocks.gradeActionFeedback.mockResolvedValue({
      qualityScore: 2,
      feedback: 'Perjelas hasil yang kamu amati.',
    });

    const result = await submitActionReport(USER, INPUT);

    expect(result).toMatchObject({
      qualityScore: 2,
      verified: false,
      xpAwarded: 0,
      canRevise: true,
    });
    expect(fake.recorded.updates.filter((entry) => entry.table === actions)).toHaveLength(0);
    expect(fake.recorded.inserts.filter((entry) => entry.table === xpEvents)).toHaveLength(0);
  });

  it('allows exactly one revision after a first low score', async () => {
    fake.results.push(
      [SNAPSHOT_ACTION],
      [snapshotReport('r-1', 2)],
      [lockRow()],
      [{ id: 'r-1' }],
      [{ id: REPORT_ID, createdAt: NOW }],
      [{ id: 'xp-verified' }],
    );
    mocks.gradeActionFeedback.mockResolvedValue({
      qualityScore: 3,
      feedback: 'Revisimu sudah spesifik.',
    });

    const result = await submitActionReport(USER, INPUT);

    expect(result).toMatchObject({ verified: true, xpAwarded: 50, canRevise: false });
    expect(mocks.gradeActionFeedback).toHaveBeenCalledTimes(1);
  });

  it('rejects a third graded attempt with revisionLimit before calling AI', async () => {
    fake.results.push([SNAPSHOT_ACTION], [snapshotReport('r-1', 2), snapshotReport('r-2', 1)]);

    await expect(submitActionReport(USER, INPUT)).rejects.toMatchObject({
      code: 'revisionLimit',
    });
    expect(mocks.gradeActionFeedback).not.toHaveBeenCalled();
    expect(fake.recorded.transactionCount).toBe(0);
  });

  it('rejects a completed/verified action with alreadyCompleted before calling AI', async () => {
    fake.results.push([{ ...SNAPSHOT_ACTION, status: 'done' }], []);

    await expect(submitActionReport(USER, INPUT)).rejects.toMatchObject({
      code: 'alreadyCompleted',
    });
    expect(mocks.gradeActionFeedback).not.toHaveBeenCalled();
  });

  it('rejects a stale snapshot with conflict when another report landed during AI', async () => {
    fake.results.push([SNAPSHOT_ACTION], [], [lockRow()], [{ id: 'concurrent-report' }]);

    await expect(submitActionReport(USER, INPUT)).rejects.toMatchObject({ code: 'conflict' });
    expect(fake.recorded.inserts).toHaveLength(0);
    expect(fake.recorded.updates).toHaveLength(0);
  });

  it('rejects a stale snapshot with conflict when the action status changed during AI', async () => {
    fake.results.push([SNAPSHOT_ACTION], [], [lockRow('done')], []);

    await expect(submitActionReport(USER, INPUT)).rejects.toMatchObject({ code: 'conflict' });
    expect(fake.recorded.inserts).toHaveLength(0);
  });

  it('does not store a report or burn a revision when grading is unavailable', async () => {
    fake.results.push([SNAPSHOT_ACTION], []);
    mocks.gradeActionFeedback.mockRejectedValue(new JournalError('gradingUnavailable'));

    await expect(submitActionReport(USER, INPUT)).rejects.toMatchObject({
      code: 'gradingUnavailable',
    });
    expect(fake.recorded.transactionCount).toBe(0);
    expect(fake.recorded.inserts).toHaveLength(0);
  });

  it('is notFound for a foreign action before any AI call', async () => {
    fake.results.push([]);
    await expect(submitActionReport(USER, INPUT)).rejects.toMatchObject({ code: 'notFound' });
    expect(mocks.gradeActionFeedback).not.toHaveBeenCalled();
  });

  it('rejects malformed input (including a too-short report) before reading or grading', async () => {
    await expect(
      submitActionReport(USER, { ...INPUT, whatIDid: 'terlalu pendek' }),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    expect(fake.recorded.selects).toHaveLength(0);
    expect(mocks.gradeActionFeedback).not.toHaveBeenCalled();
  });

  it('does not accept client-supplied userId, model, quality or passed values', async () => {
    await expect(
      submitActionReport(USER, { ...INPUT, userId: USER_ID, qualityScore: 4 } as never),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    expect(fake.recorded.selects).toHaveLength(0);
  });

  it('reads the snapshot before AI and rechecks the locked action and report ids in the write transaction', async () => {
    fake.results.push(
      [SNAPSHOT_ACTION],
      [],
      [lockRow()],
      [],
      [{ id: REPORT_ID, createdAt: NOW }],
      [{ id: 'xp-verified' }],
    );

    await submitActionReport(USER, INPUT);

    expect(fake.recorded.selects).toHaveLength(4);
    expect(fake.recorded.selects[0]?.locked).toBe(false);
    expect(fake.recorded.selects[2]?.locked).toBe(true);
    const lockWhere = renderSql(fake.recorded.selects[2]?.where);
    expect(lockWhere.sql).toMatch(/"actions"\."user_id" = \$\d+/);
    expect(lockWhere.sql).toMatch(/"unbooks"\."user_id" = \$\d+/);
    expect(lockWhere.params.filter((param) => param === USER_ID)).toHaveLength(2);
    expect(fake.recorded.selects[3]?.where).toBeTruthy();
    expect(fake.recorded.inserts.find((entry) => entry.table === userStats)).toBeTruthy();
  });
});
