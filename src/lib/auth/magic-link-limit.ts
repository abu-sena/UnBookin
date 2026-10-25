import 'server-only';
import { and, count, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { verificationTokens } from '@/db/schema/auth';
import { EMAIL_VERIFICATION_MAX_AGE_SECONDS, magicLinkCutoff } from '@/lib/auth/rate-limit';

/** Magic-link tokens issued to this email within the last hour (PRD §11). */
export async function countRecentMagicLinkTokens(identifier: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, identifier),
        gt(verificationTokens.expires, magicLinkCutoff(EMAIL_VERIFICATION_MAX_AGE_SECONDS)),
      ),
    );
  return Number(row?.value ?? 0);
}
