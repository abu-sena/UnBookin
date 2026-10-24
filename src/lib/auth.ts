import 'server-only';
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import ResendProvider from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq, sql } from 'drizzle-orm';
import { PgDatabase } from 'drizzle-orm/pg-core';
import { Resend } from 'resend';
import { db } from '@/db';
import { accounts, sessions, users, verificationTokens } from '@/db/schema/auth';
import { isAdminEmail } from '@/lib/auth/admin';
import messages from '@/messages/id.json';

// The shared lazy DB proxy has Object.prototype; expose its dialect for adapter detection.
const adapterDb = new Proxy(db, { getPrototypeOf: () => PgDatabase.prototype });

async function promoteAdmin(user: { id?: string; email?: string | null }) {
  if (user.id && isAdminEmail(user.email, process.env.ADMIN_EMAILS)) {
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

// Lazy configuration keeps adapter/database and SDK initialization out of builds.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(adapterDb, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google,
    ResendProvider({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        if (!provider.from) throw new Error('EMAIL_FROM is required to send verification email.');
        const copy = messages.auth.email;
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: provider.from,
          to: identifier,
          subject: copy.subject,
          text: `${copy.intro}\n\n${copy.action}: ${url}\n\n${copy.expiry}\n${copy.ignore}`,
          html: `<p>${escapeHtml(copy.intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(copy.action)}</a></p><p>${escapeHtml(copy.expiry)}</p><p>${escapeHtml(copy.ignore)}</p>`,
        });
        if (error) throw new Error('Unable to send verification email.');
      },
    }),
  ],
  session: { strategy: 'database', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/masuk', verifyRequest: '/masuk/cek-email', error: '/masuk' },
  callbacks: {
    async signIn({ user }) {
      if (user.email) {
        const [storedUser] = await db
          .select()
          .from(users)
          .where(sql`lower(trim(${users.email})) = ${user.email.trim().toLowerCase()}`)
          .limit(1);
        if (storedUser?.deletedAt) return false;
        if (storedUser) await promoteAdmin(storedUser);
      }
      return !user.deletedAt;
    },
    // Build the session explicitly: with database sessions the incoming object also carries
    // `sessionToken` and the full user row, which /api/auth/session would expose to the browser.
    async session({ session, user }) {
      return {
        expires: session.expires,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role ?? 'user',
          deletedAt: user.deletedAt ?? null,
        },
      };
    },
  },
  events: {
    createUser: ({ user }) => promoteAdmin(user),
    signIn: ({ user }) => promoteAdmin(user),
  },
}));
