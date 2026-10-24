import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  variant: vi.fn(),
  position: vi.fn(),
  email: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: { select: mocks.select, insert: mocks.insert } }));
vi.mock('@/lib/waitlist/get-price-variant', () => ({ getPriceVariant: mocks.variant }));
vi.mock('@/lib/waitlist/position', () => ({ getWaitlistPosition: mocks.position }));
vi.mock('@/lib/waitlist/email', () => ({ sendWaitlistEmail: mocks.email }));
import { joinWaitlist } from '@/lib/waitlist/actions';

function form(override: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({
    email: ' PERSON@Example.com ',
    interestSlug: 'islamic-studies',
    ...override,
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}
function selectResult(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: async () => rows }) }) };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.variant.mockResolvedValue('B');
  mocks.position.mockResolvedValue(12);
  mocks.email.mockResolvedValue(undefined);
});
describe('joinWaitlist', () => {
  it('rejects bad email before querying DB', async () => {
    expect(await joinWaitlist({ status: 'idle' }, form({ email: 'bad' }))).toEqual({
      status: 'error',
      messageKey: 'invalidInput',
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('rejects unknown or inactive interests against DB', async () => {
    mocks.select.mockReturnValueOnce(selectResult([]));
    expect(await joinWaitlist({ status: 'idle' }, form({ interestSlug: 'unknown' }))).toEqual({
      status: 'error',
      messageKey: 'invalidInterest',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('pretends success for honeypot without DB access', async () => {
    expect(
      await joinWaitlist({ status: 'idle' }, form({ website: 'bot', email: 'bad' })),
    ).toMatchObject({ status: 'success', position: 1 });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('maps preexisting email to friendly message without insert', async () => {
    mocks.select
      .mockReturnValueOnce(selectResult([{ slug: 'islamic-studies' }]))
      .mockReturnValueOnce(selectResult([{ id: 'existing' }]));
    expect(await joinWaitlist({ status: 'idle' }, form())).toEqual({
      status: 'error',
      messageKey: 'duplicateEmail',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('maps concurrent duplicate unique violation 23505 to friendly message', async () => {
    mocks.select
      .mockReturnValueOnce(selectResult([{ slug: 'islamic-studies' }]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([{ id: 'existing' }]));
    mocks.insert.mockReturnValue({
      values: () => ({ returning: () => Promise.reject({ code: '23505' }) }),
    });
    expect(await joinWaitlist({ status: 'idle' }, form())).toEqual({
      status: 'error',
      messageKey: 'duplicateEmail',
    });
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it('uses server variant, normalizes email, stores referrer and returns own data only', async () => {
    mocks.select
      .mockReturnValueOnce(selectResult([{ slug: 'islamic-studies' }]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([{ id: 'referrer' }]));
    const values = vi.fn(() => ({ returning: async () => [{ id: 'new-id' }] }));
    mocks.insert.mockReturnValue({ values });
    const result = await joinWaitlist(
      { status: 'idle' },
      form({ ref: 'ABcd2345', price_variant: 'A' }),
    );
    expect(result).toEqual({
      status: 'success',
      position: 12,
      referralCode: expect.stringMatching(/^[A-Za-z2-9]{8}$/),
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'person@example.com',
        priceVariant: 'B',
        referredBy: 'referrer',
      }),
    );
    expect(mocks.email).toHaveBeenCalledWith('person@example.com', 12, expect.any(String));
  });
  it('retries referral collisions and ignores unknown referral codes', async () => {
    mocks.select
      .mockReturnValueOnce(selectResult([{ slug: 'islamic-studies' }]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]));
    const values = vi
      .fn()
      .mockReturnValueOnce({ returning: () => Promise.reject({ cause: { code: '23505' } }) })
      .mockReturnValueOnce({ returning: async () => [{ id: 'new-id' }] });
    mocks.insert.mockReturnValue({ values });
    expect(await joinWaitlist({ status: 'idle' }, form({ ref: 'unknown8' }))).toMatchObject({
      status: 'success',
    });
    expect(values).toHaveBeenCalledTimes(2);
    expect(values.mock.calls[0]![0]).toMatchObject({ referredBy: undefined });
  });
});
