import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), limit: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: { select: mocks.select } }));
import { getTaskConfig, resetTaskConfigCache } from '@/lib/ai/task-config';

const row = {
  model: ' configured-primary ',
  fallbackModel: ' configured-fallback ',
  temperature: 0.4,
  maxOutputTokens: 2048,
};

beforeEach(() => {
  resetTaskConfigCache();
  mocks.select.mockReset().mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: mocks.limit }) }),
  }));
  mocks.limit.mockReset().mockResolvedValue([row]);
});
afterEach(() => vi.useRealTimers());

it('returns trimmed active configuration and caches successes per task for five minutes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
  expect(await getTaskConfig('outline')).toEqual({
    ...row,
    model: 'configured-primary',
    fallbackModel: 'configured-fallback',
  });
  vi.advanceTimersByTime(299_999);
  await getTaskConfig('outline');
  expect(mocks.select).toHaveBeenCalledTimes(1);
  await getTaskConfig('quiz');
  expect(mocks.select).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(1);
  await getTaskConfig('outline');
  expect(mocks.select).toHaveBeenCalledTimes(3);
});

it.each([{ rows: [] }, { rows: [{ ...row, model: ' ' }] }])(
  'rejects missing/inactive or blank configs without caching',
  async ({ rows }) => {
    mocks.limit.mockResolvedValue(rows);
    await expect(getTaskConfig('outline')).rejects.toMatchObject({ code: 'configurationMissing' });
    mocks.limit.mockResolvedValue([{ ...row, fallbackModel: ' ' }]);
    expect(await getTaskConfig('outline')).toMatchObject({ fallbackModel: null });
    expect(mocks.select).toHaveBeenCalledTimes(2);
  },
);

it('sanitizes DB failures and never caches them', async () => {
  mocks.limit.mockRejectedValueOnce(new Error('private database details'));
  await expect(getTaskConfig('outline')).rejects.toMatchObject({
    code: 'generationUnavailable',
    message: 'generationUnavailable',
  });
  await getTaskConfig('outline');
  expect(mocks.select).toHaveBeenCalledTimes(2);
});
