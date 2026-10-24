'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn, signOut } from '@/lib/auth';
import { emailSignInSchema, safeCallbackUrl } from '@/lib/auth/validation';

export async function signOutAction() {
  await signOut({ redirectTo: '/masuk' });
}

export async function googleSignInAction(formData: FormData) {
  const callbackUrl = safeCallbackUrl(formData.get('callbackUrl'));
  try {
    await signIn('google', { redirectTo: callbackUrl });
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    redirect(
      `/masuk?error=${encodeURIComponent(error.type)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  }
}

export async function emailSignInAction(formData: FormData) {
  const callbackUrl = safeCallbackUrl(formData.get('callbackUrl'));
  const result = emailSignInSchema.safeParse({ email: formData.get('email') });
  if (!result.success)
    redirect(`/masuk?error=InvalidEmail&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  try {
    await signIn('resend', { email: result.data.email, redirectTo: callbackUrl });
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    redirect(
      `/masuk?error=${encodeURIComponent(error.type)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  }
}
