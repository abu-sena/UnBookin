import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', async () => {
  const { fake } = await import('./fake-db');
  return { db: fake.db };
});

import { getJournalAction, listJournal, loadReportSnapshot } from '@/lib/journal/queries';
import { fake, renderSql } from './fake-db';

const USER = { userId: '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f' };
const USER_ID = USER.userId;
const ACTION_A = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const ACTION_B = 'c3d4e5f6-7b8c-4d9e-af0f-2a3b4c5d6e7f';
const ACTION_C = 'd4e5f6a7-8c9d-4eaf-b01f-3b4c5d6e7f8a';
const ACTION_D = 'e5f6a7b8-9d0e-4fb0-c21a-4c5d6e7f8a9b';
const MODULE_A = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UNBOOK_A = 'f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b9c';
const NOW = new Date('2026-10-28T08:00:00.000Z');

const ROW_A = {
  id: ACTION_A,
  moduleId: MODULE_A,
  moduleTitle: 'Modul A',
  unbookId: UNBOOK_A,
  title: 'Aksi A',
  description: 'Deskripsi A',
  dueAt: NOW,
  status: 'planned' as const,
};
const ROW_B = {
  ...ROW_A,
  id: ACTION_B,
  title: 'Aksi B',
  dueAt: null,
  status: 'planned' as const,
};
const ROW_C = {
  ...ROW_A,
  id: ACTION_C,
  title: 'Aksi C',
  dueAt: new Date('2026-10-20T08:00:00.000Z'),
  status: 'planned' as const,
};
const ROW_D = {
  ...ROW_A,
  id: ACTION_D,
  title: 'Aksi D',
  dueAt: new Date('2026-10-19T08:00:00.000Z'),
  status: 'done' as const,
};

function reportRow(actionId: string, id: string, qualityScore: number | null) {
  return {
    actionId,
    id,
    whatIDid: 'a'.repeat(80),
    result: 'Hasil',
    reflection: '',
    evidenceUrl: null,
    aiFeedback: 'Umpan balik',
    qualityScore,
    verified: (qualityScore ?? 0) >= 3,
    createdAt: new Date('2026-10-28T07:00:00.000Z'),
  };
}

beforeEach(() => {
  fake.reset();
});

describe('listJournal', () => {
  it('reads only the caller own ready Unbook and groups reports with report-slot rules', async () => {
    fake.results.push(
      [ROW_A, ROW_B, ROW_C, ROW_D],
      [reportRow(ACTION_C, 'r-1', 2), reportRow(ACTION_D, 'r-2', 4), reportRow(ACTION_D, 'r-3', 1)],
    );

    const items = await listJournal(USER);

    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      id: ACTION_A,
      moduleId: MODULE_A,
      moduleTitle: 'Modul A',
      unbookId: UNBOOK_A,
      status: 'planned',
      reports: [],
      canReport: true,
    });
    expect(items[0]?.dueAt).toBe(NOW);
    expect(items[1]).toMatchObject({ id: ACTION_B, dueAt: null, canReport: true });
    expect(items[2]).toMatchObject({ id: ACTION_C, canReport: true });
    expect(items[2]?.reports[0]).toMatchObject({ id: 'r-1', qualityScore: 2, verified: false });
    expect(items[3]).toMatchObject({ id: ACTION_D, status: 'done', canReport: false });
    expect(items[3]?.reports.map((report) => report.id)).toEqual(['r-2', 'r-3']);

    const [actionQuery, reportQuery] = fake.recorded.selects;
    const where = renderSql(actionQuery?.where);
    expect(where.sql).toMatch(/"actions"\."user_id" = \$\d+/);
    expect(where.sql).toMatch(/"unbooks"\."user_id" = \$\d+/);
    expect(where.sql).toMatch(/"unbooks"\."status" = \$\d+/);
    expect(where.params.filter((param) => param === USER_ID)).toHaveLength(2);
    expect(where.params).toContain('ready');

    const order = (actionQuery?.orderBy ?? []).map((part) => renderSql(part).sql);
    expect(order[0]).toContain('case when');
    expect(order[0]).toContain("'planned'");
    expect(order[1]).toMatch(/due_at.*nulls last/i);

    expect(renderSql(reportQuery?.where).sql).toMatch(/"action_reports"\."action_id" in/);
  });

  it('returns an empty list without a reports query when the user has no actions', async () => {
    fake.results.push([]);
    expect(await listJournal(USER)).toEqual([]);
    expect(fake.recorded.selects).toHaveLength(1);
  });

  it('rejects malformed session identities before querying', async () => {
    await expect(listJournal({ userId: 'forged' } as never)).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(fake.recorded.selects).toHaveLength(0);
  });
});

describe('getJournalAction', () => {
  it('is notFound when the action is foreign, missing or not from a ready Unbook', async () => {
    fake.results.push([]);
    await expect(getJournalAction(USER, { actionId: ACTION_A })).rejects.toMatchObject({
      code: 'notFound',
    });
    const where = renderSql(fake.recorded.selects[0]?.where);
    expect(where.sql).toMatch(/"actions"\."id" = \$\d+/);
    expect(where.sql).toMatch(/"actions"\."user_id" = \$\d+/);
    expect(where.sql).toMatch(/"unbooks"\."user_id" = \$\d+/);
    expect(where.sql).toMatch(/"unbooks"\."status" = \$\d+/);
    expect(where.params).toContain(ACTION_A);
    expect(where.params.filter((param) => param === USER_ID)).toHaveLength(2);
  });

  it('loads one owned action with its reports', async () => {
    fake.results.push([ROW_A], [reportRow(ACTION_A, 'r-1', 2)]);
    const item = await getJournalAction(USER, { actionId: ACTION_A });
    expect(item.id).toBe(ACTION_A);
    expect(item.reports).toHaveLength(1);
    expect(item.canReport).toBe(true);
  });
});

describe('loadReportSnapshot', () => {
  it('reads status/module/report ids before any AI call with owner predicates', async () => {
    fake.results.push(
      [
        {
          id: ACTION_A,
          moduleId: MODULE_A,
          title: 'Aksi A',
          status: 'planned',
          moduleTitle: 'Modul A',
          moduleSummary: 'Ringkasan A',
          content: { layers: { practitioner: [] } },
        },
      ],
      [{ id: 'r-1', qualityScore: 2 }],
    );

    const snapshot = await loadReportSnapshot(USER, ACTION_A);

    expect(snapshot).toMatchObject({
      action: { id: ACTION_A, moduleId: MODULE_A, title: 'Aksi A', status: 'planned' },
      moduleTitle: 'Modul A',
      moduleSummary: 'Ringkasan A',
      reports: [{ id: 'r-1', qualityScore: 2 }],
    });
    const where = renderSql(fake.recorded.selects[0]?.where);
    expect(where.sql).toMatch(/"actions"\."user_id" = \$\d+/);
    expect(where.sql).toMatch(/"unbooks"\."user_id" = \$\d+/);
    expect(where.params.filter((param) => param === USER_ID)).toHaveLength(2);
  });

  it('is notFound for a foreign action', async () => {
    fake.results.push([]);
    await expect(loadReportSnapshot(USER, ACTION_A)).rejects.toMatchObject({ code: 'notFound' });
  });
});
