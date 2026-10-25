import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }));
vi.mock('@/lib/auth', () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock('@/db', () => ({ db: { select: dbMocks.select } }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect');
  }),
}));
import { signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { emailSignInAction } from '@/lib/auth/actions';
import { emailSignInSchema, safeCallbackUrl } from '@/lib/auth/validation';

function countRows(value: number) {
  return { from: () => ({ where: async () => [{ value }] }) };
}

describe('email sign-in validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.select.mockReturnValue(countRows(0));
  });
  it.each(['', 'invalid', 'name@', '@example.com'])('rejects invalid email %s', (email) => {
    expect(emailSignInSchema.safeParse({ email }).success).toBe(false);
  });
  it('normalizes valid email', () => {
    expect(emailSignInSchema.parse({ email: ' Test@Example.com ' })).toEqual({
      email: 'test@example.com',
    });
  });
  it('does not invoke Auth.js for invalid form input', async () => {
    const data = new FormData();
    data.set('email', 'invalid');
    await expect(emailSignInAction(data)).rejects.toThrow('redirect');
    expect(signIn).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith('/masuk?error=InvalidEmail&callbackUrl=%2Fhome');
  });
  it('passes valid email and local callback to Auth.js', async () => {
    const data = new FormData();
    data.set('email', ' Test@Example.com ');
    data.set('callbackUrl', '/library');
    await emailSignInAction(data);
    expect(signIn).toHaveBeenCalledWith('resend', {
      email: 'test@example.com',
      redirectTo: '/library',
    });
  });
  it('allows the fifth magic link when only four were requested in the last hour', async () => {
    dbMocks.select.mockReturnValue(countRows(4));
    const data = new FormData();
    data.set('email', 'person@example.com');
    await emailSignInAction(data);
    expect(signIn).toHaveBeenCalledOnce();
  });
  it('blocks sending and surfaces RateLimited after five tokens in the last hour', async () => {
    dbMocks.select.mockReturnValue(countRows(5));
    const data = new FormData();
    data.set('email', 'person@example.com');
    data.set('callbackUrl', '/library');
    await expect(emailSignInAction(data)).rejects.toThrow('redirect');
    expect(redirect).toHaveBeenCalledWith('/masuk?error=RateLimited&callbackUrl=%2Flibrary');
    expect(signIn).not.toHaveBeenCalled();
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/masuk',
    '/api/auth/signout',
  ])('rejects unsafe callback %s', (url) => {
    expect(safeCallbackUrl(url)).toBe('/home');
  });
});
