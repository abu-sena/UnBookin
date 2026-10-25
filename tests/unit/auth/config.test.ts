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
  it('never exposes the session token or extra user columns in the session', async () => {
    const session = config.callbacks!.session!;
    const result = await session({
      session: {
        sessionToken: 'secret-token',
        userId: 'u1',
        expires: new Date('2026-12-01'),
        user: { id: 'u1', email: 'a@example.com' },
      },
      user: {
        id: 'u1',
        name: 'A',
        email: 'a@example.com',
        image: null,
        role: 'admin',
        emailVerified: null,
        createdAt: new Date(),
      },
    } as unknown as Parameters<typeof session>[0]);
    expect(result).toEqual({
      expires: new Date('2026-12-01'),
      user: {
        id: 'u1',
        name: 'A',
        email: 'a@example.com',
        image: null,
        role: 'admin',
        deletedAt: null,
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });
  it('allows new users without promoting unlisted email', async () => {
    storedUser(null);
    expect(await signIn({ user: { id: 'new', email: 'user@example.com' }, account: null })).toBe(
      true,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses to send a magic link past the hourly limit even without the form action', async () => {
    const resend = config.providers[1] as unknown as {
      sendVerificationRequest: (params: object) => Promise<void>;
    };
    const params = { identifier: 'a@example.com', url: 'https://x', provider: { from: 'U <u@x>' } };
    mocks.select.mockReturnValue({ from: () => ({ where: async () => [{ value: 6 }] }) });
    await expect(resend.sendVerificationRequest(params)).rejects.toThrow('rate limit');
    expect(mocks.send).not.toHaveBeenCalled();

    mocks.select.mockReturnValue({ from: () => ({ where: async () => [{ value: 5 }] }) });
    await resend.sendVerificationRequest(params);
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
