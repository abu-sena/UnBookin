import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  submitActionReport: vi.fn(),
  updateActionStatusStore: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/journal/store', () => ({
  submitActionReport: mocks.submitActionReport,
  updateActionStatus: mocks.updateActionStatusStore,
}));

import { reportAction, updateActionStatus } from '@/lib/journal/actions';
import { JournalError } from '@/lib/journal/errors';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const ACTION_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const REPORT = {
  actionId: ACTION_ID,
  whatIDid:
    'Saya memimpin rapat tim dengan agenda satu keputusan, membagi peran, dan mencatat hasil keputusan bersama seluruh tim.',
  result: 'Rapat selesai lima belas menit lebih cepat.',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: USER_ID });
  mocks.submitActionReport.mockResolvedValue({
    reportId: 'd4e5f6a7-8c9d-4eaf-b01f-3b4c5d6e7f8a',
    qualityScore: 4,
    feedback: 'Bagus.',
    verified: true,
    xpAwarded: 50,
    canRevise: false,
  });
  mocks.updateActionStatusStore.mockResolvedValue({
    actionId: ACTION_ID,
    status: 'skipped',
    dueAt: null,
  });
});

describe('reportAction', () => {
  it('authenticates before input parsing so the redirect propagates', async () => {
    mocks.requireUser.mockRejectedValue(new Error('NEXT_REDIRECT'));

    await expect(reportAction(REPORT)).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.requireUser).toHaveBeenCalledWith('/journal');
    expect(mocks.submitActionReport).not.toHaveBeenCalled();
  });

  it('rejects malformed/unknown input before touching the store', async () => {
    expect(await reportAction({ ...REPORT, whatIDid: 'pendek' })).toEqual({
      ok: false,
      code: 'invalidInput',
    });
    expect(await reportAction({ ...REPORT, userId: USER_ID })).toEqual({
      ok: false,
      code: 'invalidInput',
    });
    expect(mocks.submitActionReport).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('calls the service with the session identity and revalidates the journal pages', async () => {
    const result = await reportAction(REPORT);

    expect(result).toMatchObject({ ok: true, verified: true, xpAwarded: 50 });
    expect(mocks.submitActionReport).toHaveBeenCalledWith(
      { userId: USER_ID },
      { ...REPORT, reflection: '' },
    );
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      '/journal',
      '/home',
      '/progress',
      '/profile',
    ]);
  });

  it('maps safe service errors and does not revalidate on failure', async () => {
    mocks.submitActionReport.mockRejectedValue(new JournalError('gradingUnavailable'));
    expect(await reportAction(REPORT)).toEqual({ ok: false, code: 'gradingUnavailable' });

    mocks.submitActionReport.mockRejectedValue(new Error('db exploded'));
    expect(await reportAction(REPORT)).toEqual({ ok: false, code: 'unexpected' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('updateActionStatus', () => {
  it('rejects invalid operations before the store', async () => {
    expect(await updateActionStatus({ actionId: ACTION_ID, operation: 'done' })).toEqual({
      ok: false,
      code: 'invalidInput',
    });
    expect(mocks.updateActionStatusStore).not.toHaveBeenCalled();
  });

  it('forwards the session identity and revalidates after a successful transition', async () => {
    const result = await updateActionStatus({ actionId: ACTION_ID, operation: 'skip' });

    expect(result).toMatchObject({ ok: true, status: 'skipped', dueAt: null });
    expect(mocks.updateActionStatusStore).toHaveBeenCalledWith(
      { userId: USER_ID },
      { actionId: ACTION_ID, operation: 'skip' },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/journal');
  });
});
