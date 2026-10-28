/**
 * Isolation guards for the e2e harness. Pure and dependency free so config,
 * setup, teardown, seed scripts and unit tests can all share them. Every
 * destructive or fixture-writing helper calls `assertLocalTestDatabase` first.
 */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function assertLocalTestDatabase(url: string | undefined): string {
  if (!url) throw new Error('E2E guard: DATABASE_URL is missing.');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('E2E guard: DATABASE_URL is not a valid URL.');
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`E2E guard: database host "${parsed.hostname}" is not local.`);
  }
  const lower = url.toLowerCase();
  if (lower.includes('neon.tech') || lower.includes('vercel')) {
    throw new Error('E2E guard: database looks like a production host.');
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!name.toLowerCase().includes('test')) {
    throw new Error('E2E guard: database name must contain "test".');
  }
  if (parsed.port === '3000') {
    // Port 3000 is the founder dev server; never a fixture target.
    throw new Error('E2E guard: refusing the founder dev port.');
  }
  return url;
}

export function assertLocalBaseUrl(url: string): string {
  const parsed = new URL(url);
  if (!LOCAL_HOSTS.has(parsed.hostname) || parsed.protocol !== 'http:') {
    throw new Error(`E2E guard: base URL "${url}" is not a local http URL.`);
  }
  if (parsed.port === '3000' || parsed.port === '') {
    throw new Error('E2E guard: refusing the founder dev server or a default port.');
  }
  return url;
}

export function assertLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
