import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }));
vi.mock('@/lib/auth', () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect');
  }),
}));
import { signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { emailSignInAction } from '@/lib/auth/actions';
import { emailSignInSchema, safeCallbackUrl } from '@/lib/auth/validation';

describe('email sign-in validation', () => {
  beforeEach(() => vi.clearAllMocks());
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
