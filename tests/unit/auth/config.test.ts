import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextAuthConfig } from 'next-auth';

const mocks = vi.hoisted(() => ({
  nextAuth: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
  adapter: vi.fn(() => ({})),
  select: vi.fn(),
  update: vi.fn(),
  send: vi.fn(async () => ({ error: null })),
}));
vi.mock('server-only', () => ({}));
vi.mock('next-auth', () => ({ default: mocks.nextAuth }));
vi.mock('next-auth/providers/google', () => ({ default: { id: 'google' } }));
vi.mock('next-auth/providers/resend', () => ({
  default: (options: object) => ({ id: 'resend', ...options }),
}));
vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: mocks.adapter }));
vi.mock('@/db', () => ({ db: { select: mocks.select, update: mocks.update } }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

import '@/lib/auth';

// Capture lazy configuration without starting Auth.js or accessing a real DB.
const config = (mocks.nextAuth.mock.calls[0] as unknown as [() => NextAuthConfig])[0]();
const signIn = config.callbacks!.signIn!;

describe('auth configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    mocks.update.mockReturnValue({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) });
  });

  function storedUser(value: object | null) {
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => (value ? [value] : []) }) }),
    });
  }

  it('uses database sessions for thirty days', () => {
    expect(config.session).toEqual({ strategy: 'database', maxAge: 2592000 });
    expect(config.providers).toHaveLength(2);
  });
  it('blocks soft-deleted sign-ins', async () => {
    storedUser({ id: 'deleted', email: 'admin@example.com', deletedAt: new Date() });
    expect(
      await signIn({ user: { id: 'deleted', email: 'admin@example.com' }, account: null }),
    ).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('promotes allowlisted users during sign-in', async () => {
    storedUser({ id: 'admin', email: ' Admin@Example.com ', deletedAt: null });
    expect(await signIn({ user: { id: 'admin', email: 'admin@example.com' }, account: null })).toBe(
      true,
    );
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it('allows new users without promoting unlisted email', async () => {
    storedUser(null);
    expect(await signIn({ user: { id: 'new', email: 'user@example.com' }, account: null })).toBe(
      true,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
