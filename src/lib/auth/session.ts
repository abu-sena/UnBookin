import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { auth } from '@/lib/auth';
import { safeCallbackUrl } from '@/lib/auth/validation';

/** Get identity from the server session; never accept userId from the client. */
export async function getCurrentUser() {
  // Auth.js touches crypto before reading cookies; mark the render as request-time for Cache Components.
  await connection();
  const session = await auth();
  if (!session?.user || session.user.deletedAt) return null;
  const { id, email, name, image, role } = session.user;
  return { id, email, name, image, role };
}

/** Never accept userId from the client. Callers may supply their current local path. */
export async function requireUser(currentPath = '/home') {
  const user = await getCurrentUser();
  if (!user) redirect(`/masuk?callbackUrl=${encodeURIComponent(safeCallbackUrl(currentPath))}`);
  return user;
}

/** Never accept userId from the client; authorize using the server session. */
export async function requireAdmin(currentPath = '/home') {
  const user = await requireUser(currentPath);
  if (user.role !== 'admin') notFound();
  return user;
}
