import { afterEach, expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
import { escapeHtml, sendWaitlistEmail } from '@/lib/waitlist/email';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  send.mockReset();
});
it('skips unconfigured email with one address-free warning', async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.stubEnv('EMAIL_FROM', '');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await sendWaitlistEmail('private@example.com', 2, 'ABCDef23');
  await sendWaitlistEmail('private@example.com', 2, 'ABCDef23');
  expect(send).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls.flat().join(' ')).not.toContain('private@example.com');
});
it('escapes HTML and sends Indonesian text, position and share link', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test');
  vi.stubEnv('EMAIL_FROM', 'from@example.com');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
  send.mockResolvedValue({ error: null });
  await sendWaitlistEmail('person@example.com', 12, 'ABCDef23');
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      text: expect.stringContaining('ke-12'),
      html: expect.stringContaining('https://example.com/?ref=ABCDef23'),
    }),
  );
  expect(escapeHtml('<a "x">&\'')).toBe('&lt;a &quot;x&quot;&gt;&amp;&#39;');
});
it('swallows SDK rejection without logging address', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test');
  vi.stubEnv('EMAIL_FROM', 'from@example.com');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
  send.mockRejectedValue(new Error('private@example.com'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(sendWaitlistEmail('private@example.com', 1, 'ABCDef23')).resolves.toBeUndefined();
  expect(warn.mock.calls.flat().join(' ')).not.toContain('private@example.com');
});
