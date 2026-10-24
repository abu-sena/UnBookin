import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect');
  }),
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));

import { auth } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, requireAdmin, requireUser } from '@/lib/auth/session';

const user = {
  id: 'user-1',
  name: 'Test',
  email: 'test@example.com',
  image: null,
  role: 'user' as const,
};
function mockSession(
  value: typeof user | (Omit<typeof user, 'role'> & { role: 'admin'; deletedAt?: Date }) | null,
) {
  // Auth.js overloads include a middleware signature; this test uses its no-argument session API.
  vi.mocked(auth).mockResolvedValue(
    (value ? { user: value, expires: '2027-01-01' } : null) as never,
  );
}

describe('server session guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(null);
  });

  it('returns null for signed-out users', async () => {
    expect(await getCurrentUser()).toBeNull();
  });
  it('redirects signed-out users with the default callback', async () => {
    await expect(requireUser()).rejects.toThrow('redirect');
    expect(redirect).toHaveBeenCalledWith('/masuk?callbackUrl=%2Fhome');
  });
  it('preserves a caller-supplied path and query', async () => {
    await expect(requireUser('/library?sort=recent')).rejects.toThrow('redirect');
    expect(redirect).toHaveBeenCalledWith('/masuk?callbackUrl=%2Flibrary%3Fsort%3Drecent');
  });
  it('returns only the current server user', async () => {
    mockSession(user);
    expect(await requireUser()).toEqual(user);
  });
  it('hides admin resources from normal users', async () => {
    mockSession(user);
    await expect(requireAdmin()).rejects.toThrow('not found');
    expect(notFound).toHaveBeenCalledOnce();
  });
  it('permits admins', async () => {
    mockSession({ ...user, role: 'admin' });
    expect(await requireAdmin()).toEqual({ ...user, role: 'admin' });
  });
  it('rejects sessions belonging to soft-deleted users', async () => {
    mockSession({ ...user, role: 'admin', deletedAt: new Date() });
    await expect(requireUser()).rejects.toThrow('redirect');
  });
});
