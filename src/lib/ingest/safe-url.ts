import 'server-only';
import { promises as dnsPromises, type LookupAddress, type LookupOptions } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { SourceError } from '@/lib/sources/errors';

/**
 * SSRF-safe, bounded HTML/text fetcher for URL sources.
 *
 * Security layers (defense in depth):
 * 1. URL policy: http/https only, no credentials, only default/80/443 ports,
 *    no localhost / local / internal / test hostnames, no control characters,
 *    maximum 2048 characters.
 * 2. Address policy: IP literals and every DNS answer must be a global unicast
 *    address (ipaddr.js range checks + 2000::/3 for IPv6), so private,
 *    reserved, metadata, ULA, multicast, loopback, link-local, IPv4-mapped and
 *    documentation ranges are rejected; one bad answer rejects the host.
 * 3. DNS pinning: the validated address is pinned through a custom `lookup`
 *    callback on node http/https.request, so a second DNS resolution
 *    (rebinding) cannot swap the target. Host header and TLS servername stay
 *    the hostname; the socket connects only to the validated address.
 * 4. Transport bounds: <=15s per hop covering DNS+headers+body, at most 5
 *    redirect hops with every target revalidated end to end, streamed bytes
 *    counted (Content-Length never trusted), compressed responses rejected,
 *    only 200 responses with an HTML/text content type accepted, no cookies
 *    or authorization headers ever sent or forwarded.
 *
 * Errors are always `SourceError` codes: `invalidUrl`, `fetchFailed`,
 * `fileTooLarge`. Raw URLs, vendor errors, response bodies and credentials are
 * never logged or propagated. DNS and transport are injectable narrow
 * dependencies so tests never touch a real network. No bypass flags exist.
 */

export const URL_MAX_LENGTH = 2048;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 5;

const ALLOWED_PORTS = new Set(['', '80', '443']);
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
const ALLOWED_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/plain']);
const URL_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type DnsAnswer = { address: string; family: number };

export type DnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<DnsAnswer[]>;

export type SafeTransportRequest = {
  url: URL;
  address: string;
  family: number;
  timeoutMs: number;
  maxBytes: number;
};

export type SafeHeaders = Record<string, string | string[] | undefined>;

export type SafeTransportResponse = {
  status: number;
  headers: SafeHeaders;
  body: Uint8Array;
};

export type SafeTransport = (request: SafeTransportRequest) => Promise<SafeTransportResponse>;

export type SafeFetchDeps = {
  lookup?: DnsLookup;
  transport?: SafeTransport;
};

export type SafeFetchOptions = {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  deps?: SafeFetchDeps;
};

export type SafeFetchResult = {
  bytes: Uint8Array;
  contentType: string;
  url: string;
};

/** Node's `LookupFunction` shape, restated structurally (not exported by @types/node). */
type LookupFunctionLike = (
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) => void;

const defaultLookup: DnsLookup = async (hostname, options) => {
  const answers = await dnsPromises.lookup(hostname, options);
  return answers.map((answer) => ({ address: answer.address, family: answer.family }));
};

function stripBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isIpLiteral(hostname: string): boolean {
  return ipaddr.isValid(stripBrackets(hostname));
}

function addressFamily(address: string): number {
  try {
    return ipaddr.parse(address).kind() === 'ipv4' ? 4 : 6;
  } catch {
    return 0;
  }
}

/** True only for global unicast addresses; IPv4-mapped IPv6 is never allowed. */
export function isPublicAddress(address: string): boolean {
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
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (bare === suffix || bare.endsWith(`.${suffix}`)) return true;
  }
  return false;
}

/** Validate a URL end to end. Throws SourceError('invalidUrl') on any violation. */
export function assertSafeUrl(rawUrl: string): URL {
  if (
    typeof rawUrl !== 'string' ||
    rawUrl.length === 0 ||
    rawUrl.length > URL_MAX_LENGTH ||
    URL_CONTROL_CHARACTERS.test(rawUrl)
  ) {
    throw new SourceError('invalidUrl');
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourceError('invalidUrl');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SourceError('invalidUrl');
  }
  if (url.username !== '' || url.password !== '') {
    throw new SourceError('invalidUrl');
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new SourceError('invalidUrl');
  }
  if (url.hostname.length === 0 || isBlockedHostname(url.hostname)) {
    throw new SourceError('invalidUrl');
  }
  const bare = stripBrackets(url.hostname);
  if (!isIpLiteral(url.hostname) && !bare.includes('.')) {
    // Single-label hostnames resolve inside the local network at best.
    throw new SourceError('invalidUrl');
  }
  url.hash = '';
  return url;
}

/**
 * Resolve a hostname to one validated public address. Every DNS answer is
 * checked; a single private/reserved address rejects the whole host.
 */
async function resolvePublicAddress(hostname: string, lookup: DnsLookup): Promise<DnsAnswer> {
  const bare = stripBrackets(hostname).replace(/\.$/, '');
  if (isIpLiteral(hostname)) {
    if (!isPublicAddress(bare)) throw new SourceError('invalidUrl');
    return { address: bare, family: addressFamily(bare) };
  }
  let answers: DnsAnswer[];
  try {
    answers = await lookup(bare, { all: true, verbatim: true });
  } catch {
    throw new SourceError('fetchFailed');
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new SourceError('fetchFailed');
  }
  for (const answer of answers) {
    if (typeof answer?.address !== 'string' || !isPublicAddress(answer.address)) {
      throw new SourceError('invalidUrl');
    }
    if (answer.family !== addressFamily(answer.address)) {
      throw new SourceError('invalidUrl');
    }
  }
  return { address: answers[0]!.address, family: answers[0]!.family };
}

function headerValue(headers: SafeHeaders, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string' && first.length > 0) return first;
    return undefined;
  }
  return undefined;
}

function mediaTypeOf(contentType: string | undefined): string | undefined {
  const type = contentType?.split(';')[0]?.trim().toLowerCase();
  return type && type.length > 0 ? type : undefined;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function contentLengthOf(headers: SafeHeaders): number {
  const raw = headerValue(headers, 'content-length');
  return typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0;
}

function concatChunks(chunks: Buffer[], total: number): Uint8Array {
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Default transport: node http/https with the validated address pinned through
 * a custom `lookup`. The hostname stays for Host/TLS SNI, the socket goes to
 * the pinned address, so DNS cannot be rebound between validation and request.
 * The body is streamed and counted; Content-Length is only used to reject
 * oversized responses early, never to trust the amount of data received.
 */
const defaultTransport: SafeTransport = (request) => {
  return new Promise<SafeTransportResponse>((resolve, reject) => {
    const isHttps = request.url.protocol === 'https:';
    const hostname = stripBrackets(request.url.hostname);
    const isIp = ipaddr.isValid(hostname);
    let settled = false;

    const fail = (code: 'fetchFailed' | 'invalidUrl' | 'fileTooLarge') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new SourceError(code));
    };
    const succeed = (value: SafeTransportResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    // Pin: ignore the hostname argument, always answer with the validated IP.
    const pinnedLookup: LookupFunctionLike = (_hostname, _options, callback) => {
      callback(null, request.address, request.family);
    };

    const options: http.RequestOptions = {
      protocol: request.url.protocol,
      hostname,
      port: request.url.port ? Number(request.url.port) : isHttps ? 443 : 80,
      method: 'GET',
      path: `${request.url.pathname}${request.url.search}`,
      headers: {
        Host: request.url.host,
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Encoding': 'identity',
        'User-Agent': 'UnbookinIngest/1.0',
        Connection: 'close',
      },
      lookup: pinnedLookup,
      agent: false,
    };
    if (isHttps && !isIp) {
      // Preserve TLS servername for SNI while connecting to the pinned address.
      (options as https.RequestOptions).servername = hostname;
    }

    const client = (isHttps ? https : http).request(options, (response) => {
      const status = response.statusCode ?? 0;
      const headers: SafeHeaders = response.headers;
      const finishHeadersOnly = () => {
        response.destroy();
        succeed({ status, headers, body: new Uint8Array() });
      };
      // Redirect/error bodies are never needed; drop the connection early.
      if (status < 200 || status > 299) {
        finishHeadersOnly();
        return;
      }
      const declaredLength = contentLengthOf(headers);
      if (declaredLength > request.maxBytes) {
        fail('fileTooLarge');
        response.destroy();
        return;
      }
      const encoding = headerValue(headers, 'content-encoding');
      if (encoding && encoding.trim().toLowerCase() !== 'identity') {
        finishHeadersOnly();
        return;
      }
      const type = mediaTypeOf(headerValue(headers, 'content-type'));
      if (!type || !ALLOWED_CONTENT_TYPES.has(type)) {
        finishHeadersOnly();
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > request.maxBytes) {
          fail('fileTooLarge');
          response.destroy();
          client.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        succeed({ status, headers, body: concatChunks(chunks, total) });
      });
      response.on('error', () => fail('fetchFailed'));
    });
    const timer = setTimeout(() => {
      fail('fetchFailed');
      client.destroy();
    }, request.timeoutMs);
    timer.unref?.();
    client.on('error', () => fail('fetchFailed'));
    client.end();
  });
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new SourceError('fetchFailed'));
    }, timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Fetch a bounded, SSRF-safe HTML/text document. Every redirect hop is
 * revalidated (URL policy + full DNS answer validation + pinned transport) and
 * bounded by one timeout covering DNS, headers and body.
 */
export async function fetchSafeUrl(
  url: string,
  options: { maxBytes: number; timeoutMs?: number; maxRedirects?: number; deps?: SafeFetchDeps },
): Promise<SafeFetchResult> {
  const { maxBytes } = options;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new SourceError('invalidInput');
  }
  const requestedTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(requestedTimeout) || requestedTimeout < 1) {
    throw new SourceError('invalidInput');
  }
  const timeoutMs = Math.min(requestedTimeout, MAX_TIMEOUT_MS);
  const requestedRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  if (!Number.isSafeInteger(requestedRedirects) || requestedRedirects < 0) {
    throw new SourceError('invalidInput');
  }
  const maxRedirects = Math.min(requestedRedirects, MAX_REDIRECTS);
  const lookup = options.deps?.lookup ?? defaultLookup;
  const transport = options.deps?.transport ?? defaultTransport;

  let current = assertSafeUrl(url);
  for (let hop = 0; ; hop += 1) {
    // One bound per hop: DNS resolution, headers and body all fit inside it.
    let response: SafeTransportResponse;
    try {
      response = await withTimeout(
        (async () => {
          const { address, family } = await resolvePublicAddress(current.hostname, lookup);
          return transport({ url: current, address, family, timeoutMs, maxBytes });
        })(),
        timeoutMs,
      );
    } catch (error) {
      if (error instanceof SourceError) throw error;
      throw new SourceError('fetchFailed');
    }
    if (isRedirectStatus(response.status)) {
      if (hop >= maxRedirects) throw new SourceError('fetchFailed');
      const location = headerValue(response.headers, 'location');
      if (!location) throw new SourceError('fetchFailed');
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new SourceError('invalidUrl');
      }
      current = assertSafeUrl(next.href);
      continue;
    }
    if (response.status !== 200) {
      throw new SourceError('fetchFailed');
    }
    if (contentLengthOf(response.headers) > maxBytes) {
      throw new SourceError('fileTooLarge');
    }
    const encoding = headerValue(response.headers, 'content-encoding');
    if (encoding && encoding.trim().toLowerCase() !== 'identity') {
      throw new SourceError('fetchFailed');
    }
    const contentType = mediaTypeOf(headerValue(response.headers, 'content-type'));
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new SourceError('fetchFailed');
    }
    if (response.body.byteLength > maxBytes) {
      throw new SourceError('fileTooLarge');
    }
    return { bytes: response.body, contentType, url: current.href };
  }
}
