import 'server-only';
import { Resend } from 'resend';
import messages from '@/messages/id.json';

let warnedMissingConfig = false;
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

export async function sendWaitlistEmail(
  email: string,
  position: number,
  referralCode: string,
): Promise<void> {
  const { RESEND_API_KEY, EMAIL_FROM, NEXT_PUBLIC_APP_URL } = process.env;
  if (!RESEND_API_KEY || !EMAIL_FROM || !NEXT_PUBLIC_APP_URL) {
    if (!warnedMissingConfig) {
      console.warn('Waitlist confirmation email skipped: missing email configuration.');
      warnedMissingConfig = true;
    }
    return;
  }
  const copy = messages.waitlist.email;
  const link = `${NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/?ref=${encodeURIComponent(referralCode)}`;
  const lines = [
    copy.intro,
    copy.position.replace('{position}', String(position)),
    copy.share,
    link,
    copy.boost,
  ];
  try {
    const result = await new Resend(RESEND_API_KEY).emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: copy.subject,
      text: lines.join('\n\n'),
      html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
    });
    if (result.error) console.warn('Waitlist confirmation email delivery failed.');
  } catch {
    console.warn('Waitlist confirmation email delivery failed.');
  }
}
