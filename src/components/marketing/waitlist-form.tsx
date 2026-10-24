'use client';

export type WaitlistInterest = { slug: string; name: string };

export type WaitlistFormProps = {
  /** The three opening interests (E0-02 AC1), loaded by the page from `interests`. */
  interests: WaitlistInterest[];
  /** Referral code from the `?ref=` query param, if any. */
  referralCode?: string;
};

/** CONTRACT — implemented by task m1-waitlist (form, success state with position + share link). */
export function WaitlistForm(props: WaitlistFormProps) {
  void props;
  return null;
}
