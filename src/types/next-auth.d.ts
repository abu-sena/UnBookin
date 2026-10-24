import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: 'user' | 'admin'; deletedAt?: Date | null } & DefaultSession['user'];
  }

  interface User {
    role?: 'user' | 'admin';
    deletedAt?: Date | null;
  }
}
