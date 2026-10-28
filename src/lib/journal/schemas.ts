import ipaddr from 'ipaddr.js';
import { z } from 'zod';
import { JournalError } from './errors';

/** Identity is always built from `requireUser()`, never from client input. */
export const journalIdentitySchema = z.object({ userId: z.uuid() });
export type JournalIdentity = z.infer<typeof journalIdentitySchema>;

export function assertJournalIdentity(identity: JournalIdentity): JournalIdentity {
  const parsed = journalIdentitySchema.safeParse(identity);
  if (!parsed.success) throw new JournalError('invalidInput');
  return parsed.data;
}

export const journalActionIdSchema = z.uuid();
export const journalOperationSchema = z.enum(['extend', 'skip']);

const URL_MAX_LENGTH = 2_048;
const URL_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const BLOCKED_HOST_SUFFIXES = [
  'localhost',
  'local',
  'localdomain',
  'internal',
  'intranet',
  'lan',
  'home',
  'test',
  'invalid',
  'onion',
] as const;

function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isPublicAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return false;
  }
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) return false;
    if (v6.range() !== 'unicast') return false;
    const firstPart = v6.parts[0] ?? 0;
    return firstPart >= 0x2000 && firstPart <= 0x3fff;
  }
  return parsed.range() === 'unicast';
}

function isBlockedHostname(hostname: string): boolean {
  const bare = stripBrackets(hostname).replace(/\.$/, '').toLowerCase();
  if (bare.length === 0) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => bare === suffix || bare.endsWith(`.${suffix}`));
}

/**
 * Evidence links are stored as-is, never fetched here. Only public http(s)
 * URLs are accepted: no credentials, script/data/file schemes, local or
 * private addresses. This prevents the stored link from becoming an SSRF or
 * unsafe-scheme vector when a later feature renders or fetches it.
 */
export function isSafeEvidenceUrl(rawUrl: string): boolean {
  if (
    rawUrl.length === 0 ||
    rawUrl.length > URL_MAX_LENGTH ||
    URL_CONTROL_CHARACTERS.test(rawUrl)
  ) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;
  if (url.hostname.length === 0 || isBlockedHostname(url.hostname)) return false;

  const bare = stripBrackets(url.hostname);
  if (ipaddr.isValid(bare)) return isPublicAddress(bare);
  // A single-label hostname can only resolve inside a local network.
  return bare.includes('.');
}

export const evidenceUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(URL_MAX_LENGTH)
  .refine(isSafeEvidenceUrl, 'Expected a public http(s) URL');

export const submitActionReportInputSchema = z.strictObject({
  actionId: journalActionIdSchema,
  whatIDid: z.string().trim().min(80).max(6_000),
  result: z.string().trim().min(1).max(4_000),
  reflection: z.string().trim().max(4_000).optional().default(''),
  evidenceUrl: evidenceUrlSchema.optional(),
});
export type SubmitActionReportInput = z.infer<typeof submitActionReportInputSchema>;

export const updateActionStatusInputSchema = z.strictObject({
  actionId: journalActionIdSchema,
  operation: journalOperationSchema,
});
export type UpdateActionStatusInput = z.infer<typeof updateActionStatusInputSchema>;

/** Strict AI output for the `action_feedback` task. */
export const actionFeedbackResultSchema = z.strictObject({
  qualityScore: z.number().int().min(1).max(4),
  feedback: z.string().trim().min(1).max(1_500),
});
export type ActionFeedbackResult = z.infer<typeof actionFeedbackResultSchema>;
