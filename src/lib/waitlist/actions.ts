'use server';

import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { interests, waitlist } from '@/db/schema';
import { getPriceVariant } from './get-price-variant';
import { generateReferralCode } from './referral';
import { waitlistSchema, type WaitlistState } from './schema';
import { getWaitlistPosition } from './position';
import { sendWaitlistEmail } from './email';

function uniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (
    ('code' in error && error.code === '23505') ||
    ('cause' in error && uniqueViolation(error.cause))
  );
}

// The assignment cookie is HttpOnly; read it on the server for anonymous analytics.
export async function getWaitlistPriceVariant() {
  return getPriceVariant();
}

export async function joinWaitlist(
  _previous: WaitlistState,
  form: FormData,
): Promise<WaitlistState> {
  if (typeof form.get('website') === 'string' && form.get('website') !== '') {
    return { status: 'success', position: 1, referralCode: generateReferralCode() };
  }
  const input = waitlistSchema.safeParse({
    email: form.get('email'),
    interestSlug: form.get('interestSlug'),
    ref: form.get('ref') || undefined,
    utm: form.get('utm') || undefined,
    website: form.get('website') || undefined,
  });
  if (!input.success) return { status: 'error', messageKey: 'invalidInput' };
  try {
    const data = input.data;
    const [interest] = await db
      .select({ slug: interests.slug })
      .from(interests)
      .where(
        and(
          eq(interests.slug, data.interestSlug),
          eq(interests.isActive, true),
          ne(interests.slug, 'general'),
        ),
      )
      .limit(1);
    if (!interest) return { status: 'error', messageKey: 'invalidInterest' };
    const [existing] = await db
      .select({ id: waitlist.id })
      .from(waitlist)
      .where(eq(waitlist.email, data.email))
      .limit(1);
    if (existing) return { status: 'error', messageKey: 'duplicateEmail' };
    const [referrer] = data.ref
      ? await db
          .select({ id: waitlist.id })
          .from(waitlist)
          .where(eq(waitlist.referralCode, data.ref))
          .limit(1)
      : [];
    const variant = await getPriceVariant();
    for (let attempt = 0; attempt < 5; attempt++) {
      const referralCode = generateReferralCode();
      try {
        const [entry] = await db
          .insert(waitlist)
          .values({
            email: data.email,
            interestSlug: data.interestSlug,
            priceVariant: variant,
            referralCode,
            referredBy: referrer?.id,
            sourceUtm: data.utm,
          })
          .returning({ id: waitlist.id });
        if (!entry) throw new Error('Waitlist insert returned no entry');
        const position = await getWaitlistPosition(entry.id);
        await sendWaitlistEmail(data.email, position, referralCode);
        return { status: 'success', position, referralCode };
      } catch (error) {
        if (!uniqueViolation(error)) throw error;
        const [duplicate] = await db
          .select({ id: waitlist.id })
          .from(waitlist)
          .where(eq(waitlist.email, data.email))
          .limit(1);
        if (duplicate) return { status: 'error', messageKey: 'duplicateEmail' };
        // Only a referral-code collision remains; generate a fresh code and retry.
      }
    }
    return { status: 'error', messageKey: 'generic' };
  } catch {
    return { status: 'error', messageKey: 'generic' };
  }
}
