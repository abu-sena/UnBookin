import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: { transaction: mocks.transaction } }));
vi.mock('@/lib/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { notificationPrefs, profiles, userInterests, userStats } from '@/db/schema';
import { saveOnboarding } from '@/lib/profile/actions';

const user = {
  id: 'user-1',
  name: 'Sena',
  email: 'sena@example.com',
  image: null,
  role: 'user' as const,
};

type SelectRow = { id?: string; slug: string };

function makeTx(selectRows: SelectRow[]) {
  const updateSet = vi.fn();
  const updateWhere = vi.fn(async () => undefined);
  const update = vi.fn(() => ({
    set: (values: unknown) => {
      updateSet(values);
      return { where: updateWhere };
    },
  }));
  const values = vi.fn(() => ({
    onConflictDoUpdate: vi.fn(async () => undefined),
    onConflictDoNothing: vi.fn(async () => undefined),
    then: (resolve: (value: unknown) => void) => resolve(undefined),
  }));
  const insert = vi.fn((table: unknown) => {
    void table;
    return { values };
  });
  const select = vi.fn(() => ({ from: () => ({ where: async () => selectRows }) }));
  const del = vi.fn(() => ({ where: vi.fn(async () => undefined) }));

  return { tx: { select, insert, update, delete: del }, insert, updateSet, update };
}

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const values: Record<string, string> = {
    displayName: 'Sena',
    jobRole: 'Manajer operasional',
    primaryInterestSlug: 'leadership-management',
    goal: 'Memimpin rapat tim yang singkat dan jelas.',
    dailyGoalMinutes: '10',
    timezone: 'Asia/Jakarta',
    ...overrides,
  };
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  data.append('additionalInterestSlugs', 'habits');
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(user);
});

describe('saveOnboarding', () => {
  it('rejects an unknown interest before writing anything', async () => {
    const fake = makeTx([]);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(fake.tx),
    );

    const result = await saveOnboarding(
      { status: 'idle' },
      form({ primaryInterestSlug: 'not-a-real-interest' }),
    );

    expect(result).toMatchObject({ status: 'error', messageKey: 'invalidInterest' });
    expect(fake.insert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('sets onboarded_at once and seeds user_stats and notification_prefs', async () => {
    const fake = makeTx([
      { id: 'interest-1', slug: 'leadership-management' },
      { id: 'interest-2', slug: 'habits' },
    ]);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback(fake.tx),
    );

    const result = await saveOnboarding({ status: 'idle' }, form());

    expect(result).toEqual({ status: 'success' });
    expect(mocks.requireUser).toHaveBeenCalledWith('/onboarding');
    expect(fake.update).toHaveBeenCalledOnce();
    expect(fake.updateSet).toHaveBeenCalledWith({ onboardedAt: expect.any(Date) });

    const insertedTables = fake.insert.mock.calls.map((call) => call[0]);
    expect(insertedTables).toEqual(
      expect.arrayContaining([profiles, userInterests, userStats, notificationPrefs]),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/home');
  });

  it('maps invalid answers to field error keys without touching the database', async () => {
    const result = await saveOnboarding({ status: 'idle' }, form({ goal: 'Belajar' }));

    expect(result).toMatchObject({
      status: 'error',
      messageKey: 'invalidInput',
      fieldErrors: { goal: 'goal' },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
