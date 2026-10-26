# M3 — SSRF-safe URL fetcher (`src/lib/ingest/safe-url.ts`)

Bounded fetcher for approved public article URLs. Server-only (`import 'server-only'`), all
failures surface as `SourceError` codes (`invalidUrl`, `fetchFailed`, `fileTooLarge`);
raw URLs, vendor errors, response bodies and credentials are never logged or propagated.

## Signature

```ts
fetchSafeUrl(
  url: string,
  options: { maxBytes: number; timeoutMs?: number; maxRedirects?: number },
  deps?: { lookup?: DnsLookup; transport?: SafeTransport },
): Promise<{ bytes: Uint8Array; contentType: string; url: string }>
```

- `maxBytes` — positive safe integer; hard cap on the streamed body.
- `timeoutMs` — per redirect hop, clamped to 15 s; covers DNS + headers + body.
- `maxRedirects` — clamped to a hard maximum of 5 regardless of caller input.
- `deps` — narrowly typed test seams (DNS resolver, transport). Production code has
  no bypass flags; tests inject these instead of touching the network.

## Defence layers

1. **URL policy** — http/https only; no credentials; only default/80/443 ports;
   max 2048 characters; control characters rejected; hostnames ending in
   `localhost`, `local`, `localdomain`, `internal`, `intranet`, `lan`, `home`,
   `test`, `invalid`, `onion` rejected; single-label hostnames rejected.
2. **Address policy** — IP literals and **every** DNS answer must be global
   unicast (`ipaddr.js` range checks; IPv6 additionally restricted to 2000::/3).
   This rejects loopback, unspecified, link-local (incl. 169.254 metadata),
   RFC 1918, carrier-grade NAT, ULA, multicast, broadcast, benchmarking,
   documentation (IPv4 TEST-NET and 2001:db8::/32), 6to4/teredo/ORB ranges and
   all IPv4-mapped IPv6. One bad answer rejects the whole host (mixed
   public/private answer sets never pass).
3. **DNS pinning** — the validated address is pinned via a custom `lookup`
   callback on `node:http/https.request`; no second DNS resolution happens.
   The callback honours both call shapes: `{ all: true }` (Node 20+ automatic
   family selection) gets `[{ address, family }]`, `{ all: false }` gets
   `address, family`. `Host` header and TLS `servername` keep the original
   hostname; the socket connects only to the validated address (DNS rebinding
   is a no-op). The default resolver is `node:dns` `promises.lookup`.
4. **Transport bounds** — one shared deadline per hop covers DNS + headers +
   body: DNS gets up to `timeoutMs`, the transport only the remaining budget,
   and once DNS times out the transport can never start (even if the resolver
   resolves later). The default transport aborts and destroys the active
   request on timeout. ≤5 hops, every redirect target revalidated end to end
   (URL policy + full DNS validation + pinned request).
   Redirect/non-200 bodies are destroyed, never buffered. Only a `200` with
   content type `text/html`, `application/xhtml+xml` or `text/plain` succeeds;
   absent/unsupported types fail; any `content-encoding` other than `identity`
   fails (no unbounded decompression; the request asks for identity only).
   `Content-Length` is never trusted: an oversized declared length is rejected
   early and the actual streamed byte count is enforced as the real bound.
   No cookies or authorization headers are ever sent or forwarded; paths come
   from the WHATWG `URL` parser, so header/path injection is not possible.

## Error mapping

| Situation | Code |
| --- | --- |
| URL/host/port/credential/literal policy violations, bad redirect target | `invalidUrl` |
| DNS failure, empty answers, timeouts, connection errors, bad status/type/encoding, redirect cap | `fetchFailed` |
| Declared or streamed body over `maxBytes` | `fileTooLarge` |
| Invalid `maxBytes` / `timeoutMs` / `maxRedirects` options | `invalidInput` |

## Tests

`tests/unit/ingest/safe-url.test.ts` — no real network. Injected resolver/transport
plus `node:https` and `node:dns` module mocks cover: valid fetch with pinning/Host/SNI
(pinned `lookup` exercised at the wire boundary with both `{ all: true }` and
`{ all: false }`), the default `node:dns` promises resolver boundary, private
literals and IPv4-mapped IPv6, mixed public/private DNS, credentials/ports, redirect
to private address and private-DNS host, redirect loop cap, timeout before headers,
hung DNS, DNS timeout with a late resolver result (transport never starts), remaining
transport budget after DNS, oversized `Content-Length`, lying streamed size,
unsupported/gzip types, relative redirects, and `isPublicAddress` range coverage.

## Limitations / follow-ups

- Accepts `application/xhtml+xml` alongside HTML/text; anything else fails.
- IPv6 global unicast is restricted to 2000::/3, so exotic routed ranges
  outside that block are refused (conservative by design).
- No caching, no compression, no retries; redirect loops and chains cap at 5 hops.
- Extraction (HTML → text) is a separate M3 step, not part of this module.
