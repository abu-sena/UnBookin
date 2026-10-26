import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSafeUrl, isPublicAddress, type DnsAnswer } from '@/lib/ingest/safe-url';
import type { SourceErrorCode } from '@/lib/sources/errors';

vi.mock('server-only', () => ({}));

const { httpsRequest, dnsLookup } = vi.hoisted(() => ({
  httpsRequest: vi.fn(),
  dnsLookup: vi.fn(),
}));

vi.mock('node:https', () => ({ default: { request: httpsRequest } }));
vi.mock('node:dns', () => ({ promises: { lookup: dnsLookup } }));

interface RequestStub extends EventEmitter {
  end: () => void;
  destroy: () => void;
}

interface ResponseStub extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  destroy: () => void;
}

type PinnedLookupAnswer = string | Array<{ address: string; family: number }>;

type PinnedLookupOptions = {
  lookup: (
    hostname: string,
    options: { all?: boolean },
    callback: (err: null, address: PinnedLookupAnswer, family?: number) => void,
  ) => void;
};

type CapturedRequest = {
  hostname: string;
  port: number;
  servername?: string;
  headers: Record<string, string>;
  agent?: boolean;
  lookup: PinnedLookupOptions['lookup'];
};

const PUBLIC_IPV4 = '93.184.216.34';
const PUBLIC_HOSTNAME = 'example.com';

const publicLookup = vi.fn(async () => [{ address: PUBLIC_IPV4, family: 4 }]);

function stubResponse(statusCode: number, headers: Record<string, string>): ResponseStub {
  return Object.assign(new EventEmitter(), {
    statusCode,
    headers,
    destroy: vi.fn(),
  }) as ResponseStub;
}

function stubRequest(
  cb: (res: ResponseStub) => void,
  res: ResponseStub,
  flow?: (res: ResponseStub) => void,
): RequestStub {
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn() }) as unknown as RequestStub;
  req.end = () => {
    process.nextTick(() => {
      cb(res);
      flow?.(res);
    });
  };
  return req;
}

type Hop = { status: number; headers?: Record<string, string>; body?: string };

function transportOf(hops: Hop[]) {
  const calls: Array<{ url: URL; address: string; family: number }> = [];
  const transport = vi.fn(
    async (request: {
      url: URL;
      address: string;
      family: number;
      timeoutMs: number;
      maxBytes: number;
    }) => {
      calls.push({
        url: new URL(request.url.href),
        address: request.address,
        family: request.family,
      });
      const hop = hops[Math.min(calls.length - 1, hops.length - 1)]!;
      return {
        status: hop.status,
        headers: hop.headers ?? {},
        body: new TextEncoder().encode(hop.body ?? ''),
      };
    },
  );
  return { transport, calls };
}

async function expectCode(promise: Promise<unknown>, code: SourceErrorCode) {
  await expect(promise).rejects.toMatchObject({ name: 'SourceError', code });
}

beforeEach(() => {
  publicLookup.mockImplementation(async () => [{ address: PUBLIC_IPV4, family: 4 }]);
  dnsLookup.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchSafeUrl', () => {
  describe('URL policy', () => {
    it('accepts an http(s) URL and returns bytes, content type and final URL as string', async () => {
      const { transport, calls } = transportOf([
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
          body: '<html>ok</html>',
        },
      ]);
      const result = await fetchSafeUrl('https://example.com/artikel?a=1#frag', {
        maxBytes: 10_000,
        deps: { lookup: publicLookup, transport },
      });
      expect(result.url).toBe('https://example.com/artikel?a=1');
      expect(result.contentType).toBe('text/html');
      expect(Buffer.from(result.bytes).toString()).toBe('<html>ok</html>');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.address).toBe(PUBLIC_IPV4);
      expect(calls[0]!.family).toBe(4);
    });

    it('rejects non-http schemes, credentials, oversized URLs and control characters', async () => {
      for (const url of [
        'ftp://example.com/book',
        'javascript:alert(1)',
        'https://user:pass@example.com/book',
        'https://user@example.com/book',
        `https://example.com/${'a'.repeat(2100)}`,
        'https://exa\nmple.com/book',
        'https://ex\tample.com/book',
      ]) {
        await expectCode(
          fetchSafeUrl(url, {
            maxBytes: 10_000,
            deps: { lookup: publicLookup, transport: transportOf([]).transport },
          }),
          'invalidUrl',
        );
      }
    });

    it('rejects non-default ports and single-label or local/internal/test hostnames', async () => {
      for (const url of [
        'http://example.com:8080/book',
        'http://example.com:3000/book',
        'http://localhost/book',
        'http://sub.localhost/book',
        'http://wiki.internal/book',
        'http://db.test/book',
        'http://nas.lan/book',
        'http://myserver.home/book',
        'http://intranet/book',
      ]) {
        await expectCode(
          fetchSafeUrl(url, {
            maxBytes: 10_000,
            deps: { lookup: publicLookup, transport: transportOf([]).transport },
          }),
          'invalidUrl',
        );
      }
    });

    it('rejects private, reserved and metadata IP literals without any DNS lookup', async () => {
      for (const url of [
        'http://127.0.0.1/book',
        'http://10.0.0.5/book',
        'http://172.16.0.9/book',
        'http://192.168.1.4/book',
        'http://169.254.169.254/latest/meta-data',
        'http://100.64.0.1/book',
        'http://0.0.0.0/book',
        'http://224.0.0.1/book',
        'http://192.0.2.9/book',
        'http://198.51.100.7/book',
        'http://203.0.113.5/book',
        'http://240.1.2.3/book',
        'http://255.255.255.255/book',
        'http://[::1]/book',
        'http://[::]/book',
        'http://[fe80::1]/book',
        'http://[fc00::1]/book',
        'http://[fd12::1]/book',
        'http://[ff02::1]/book',
        'http://[2001:db8::1]/book',
        'http://[::ffff:10.0.0.1]/book',
        'http://[::ffff:127.0.0.1]/book',
        'http://[::ffff:169.254.169.254]/book',
      ]) {
        await expectCode(
          fetchSafeUrl(url, {
            maxBytes: 10_000,
            deps: { lookup: publicLookup, transport: transportOf([]).transport },
          }),
          'invalidUrl',
        );
      }
      expect(publicLookup).not.toHaveBeenCalled();
    });

    it('allows a public IP literal directly without a DNS lookup', async () => {
      const { transport, calls } = transportOf([
        { status: 200, headers: { 'content-type': 'text/plain' }, body: 'ok' },
      ]);
      const result = await fetchSafeUrl(`http://${PUBLIC_IPV4}/book`, {
        maxBytes: 10_000,
        deps: { lookup: publicLookup, transport },
      });
      expect(result.url).toBe(`http://${PUBLIC_IPV4}/book`);
      expect(publicLookup).not.toHaveBeenCalled();
      expect(calls[0]!.address).toBe(PUBLIC_IPV4);
    });
  });

  describe('DNS validation', () => {
    it('rejects when any DNS answer is private or reserved, and never requests the host', async () => {
      const { transport } = transportOf([]);
      const lookup = vi.fn(async () => [
        { address: PUBLIC_IPV4, family: 4 },
        { address: '10.0.0.5', family: 4 },
      ]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, {
          maxBytes: 10_000,
          deps: { lookup, transport },
        }),
        'invalidUrl',
      );
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(transport).not.toHaveBeenCalled();
    });

    it('rejects a purely private DNS answer set', async () => {
      const lookup = vi.fn(async () => [{ address: '192.168.0.10', family: 4 }]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, {
          maxBytes: 10_000,
          deps: { lookup, transport: transportOf([]).transport },
        }),
        'invalidUrl',
      );
    });

    it('maps DNS failure to fetchFailed', async () => {
      const lookup = vi.fn(async () => {
        throw new Error('ENOTFOUND');
      });
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, {
          maxBytes: 10_000,
          deps: { lookup, transport: transportOf([]).transport },
        }),
        'fetchFailed',
      );
    });

    it('rejects DNS answers whose family does not match the address', async () => {
      const lookup = vi.fn(async () => [{ address: PUBLIC_IPV4, family: 6 }]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, {
          maxBytes: 10_000,
          deps: { lookup, transport: transportOf([]).transport },
        }),
        'invalidUrl',
      );
    });

    it('rejects a public/private mix of IPv6 answers including IPv4-mapped entries', async () => {
      const lookup = vi.fn(async () => [
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
        { address: '::ffff:192.168.0.1', family: 6 },
      ]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, {
          maxBytes: 10_000,
          deps: { lookup, transport: transportOf([]).transport },
        }),
        'invalidUrl',
      );
    });

    it('resolves through the default node:dns promises boundary when no lookup is injected', async () => {
      dnsLookup.mockResolvedValue([{ address: PUBLIC_IPV4, family: 4 }]);
      const { transport, calls } = transportOf([
        { status: 200, headers: { 'content-type': 'text/plain' }, body: 'ok' },
      ]);
      const result = await fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, {
        maxBytes: 10_000,
        deps: { transport },
      });
      expect(dnsLookup).toHaveBeenCalledWith(PUBLIC_HOSTNAME, { all: true, verbatim: true });
      expect(calls[0]!.address).toBe(PUBLIC_IPV4);
      expect(calls[0]!.family).toBe(4);
      expect(Buffer.from(result.bytes).toString()).toBe('ok');
    });

    it('maps default resolver failures to fetchFailed', async () => {
      dnsLookup.mockRejectedValue(new Error('ENOTFOUND'));
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, {
          maxBytes: 10_000,
          deps: { transport: transportOf([]).transport },
        }),
        'fetchFailed',
      );
    });
  });

  describe('redirect handling', () => {
    it('follows relative redirects with full revalidation of every hop', async () => {
      const { transport, calls } = transportOf([
        { status: 302, headers: { location: '/next-page' } },
        { status: 200, headers: { 'content-type': 'text/html' }, body: '<html>done</html>' },
      ]);
      const result = await fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/start`, {
        maxBytes: 10_000,
        deps: { lookup: publicLookup, transport },
      });
      expect(result.url).toBe(`https://${PUBLIC_HOSTNAME}/next-page`);
      expect(calls).toHaveLength(2);
      expect(calls[1]!.url.pathname).toBe('/next-page');
      expect(calls[1]!.url.hostname).toBe(PUBLIC_HOSTNAME);
      expect(Buffer.from(result.bytes).toString()).toBe('<html>done</html>');
    });

    it('rejects a redirect to a private address and never requests it', async () => {
      const { transport, calls } = transportOf([
        { status: 302, headers: { location: 'http://127.0.0.1/admin' } },
      ]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/start`, {
          maxBytes: 10_000,
          deps: { lookup: publicLookup, transport },
        }),
        'invalidUrl',
      );
      expect(calls).toHaveLength(1);
    });

    it('rejects a redirect to a hostname whose DNS is private', async () => {
      const { transport, calls } = transportOf([
        { status: 302, headers: { location: 'https://internal.example/book' } },
      ]);
      const lookup = vi.fn(async (hostname: string) =>
        hostname === 'internal.example'
          ? [{ address: '192.168.1.1', family: 4 }]
          : [{ address: PUBLIC_IPV4, family: 4 }],
      );
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/start`, {
          maxBytes: 10_000,
          deps: { lookup, transport },
        }),
        'invalidUrl',
      );
      expect(calls).toHaveLength(1);
    });

    it('fails after at most five redirect hops even if the caller allows more', async () => {
      const { transport, calls } = transportOf([
        { status: 302, headers: { location: `https://${PUBLIC_HOSTNAME}/loop` } },
      ]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/start`, {
          maxBytes: 10_000,
          maxRedirects: 999,
          deps: { lookup: publicLookup, transport },
        }),
        'fetchFailed',
      );
      expect(calls).toHaveLength(6);
    });

    it('honours a smaller caller redirect cap', async () => {
      const { transport, calls } = transportOf([
        { status: 301, headers: { location: `https://${PUBLIC_HOSTNAME}/b` } },
        { status: 307, headers: { location: `https://${PUBLIC_HOSTNAME}/c` } },
      ]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/a`, {
          maxBytes: 10_000,
          maxRedirects: 1,
          deps: { lookup: publicLookup, transport },
        }),
        'fetchFailed',
      );
      expect(calls).toHaveLength(2);
    });

    it('rejects a redirect without a Location header', async () => {
      const { transport } = transportOf([{ status: 302 }]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/start`, {
          maxBytes: 10_000,
          deps: { lookup: publicLookup, transport },
        }),
        'fetchFailed',
      );
    });
  });

  describe('response policy', () => {
    it('rejects non-200 success statuses', async () => {
      const { transport } = transportOf([
        { status: 204, headers: { 'content-type': 'text/html' } },
      ]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, {
          maxBytes: 10_000,
          deps: { lookup: publicLookup, transport },
        }),
        'fetchFailed',
      );
    });

    it('rejects unsupported, absent and compressed content types', async () => {
      const headerSets: Array<Record<string, string>> = [
        { 'content-type': 'application/json' },
        { 'content-type': 'application/pdf' },
        {},
        { 'content-type': 'text/html', 'content-encoding': 'gzip' },
        { 'content-type': 'text/html', 'content-encoding': 'br' },
      ];
      for (const headers of headerSets) {
        const { transport } = transportOf([{ status: 200, headers, body: 'x' }]);
        await expectCode(
          fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, {
            maxBytes: 10_000,
            deps: { lookup: publicLookup, transport },
          }),
          'fetchFailed',
        );
      }
    });

    it('rejects an oversized declared Content-Length with fileTooLarge', async () => {
      const { transport } = transportOf([
        { status: 200, headers: { 'content-type': 'text/html', 'content-length': '5000' } },
      ]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/big`, {
          maxBytes: 1000,
          deps: { lookup: publicLookup, transport },
        }),
        'fileTooLarge',
      );
    });

    it('rejects a body that lies about its streamed size with fileTooLarge', async () => {
      const { transport } = transportOf([
        {
          status: 200,
          headers: { 'content-type': 'text/html', 'content-length': '10' },
          body: 'x'.repeat(2000),
        },
      ]);
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/lying`, {
          maxBytes: 1000,
          deps: { lookup: publicLookup, transport },
        }),
        'fileTooLarge',
      );
    });

    it('maps transport failures and invalid options to safe codes', async () => {
      const transport = vi.fn(async () => {
        throw new Error('ECONNRESET');
      });
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, {
          maxBytes: 10_000,
          deps: { lookup: publicLookup, transport },
        }),
        'fetchFailed',
      );
      for (const options of [
        { maxBytes: 0, deps: { lookup: publicLookup, transport } },
        { maxBytes: -1, deps: { lookup: publicLookup, transport } },
        { maxBytes: 1.5, deps: { lookup: publicLookup, transport } },
        { maxBytes: Number.MAX_SAFE_INTEGER + 1, deps: { lookup: publicLookup, transport } },
        { maxBytes: 1000, timeoutMs: 0, deps: { lookup: publicLookup, transport } },
        { maxBytes: 1000, timeoutMs: -5, deps: { lookup: publicLookup, transport } },
        { maxBytes: 1000, maxRedirects: -1, deps: { lookup: publicLookup, transport } },
      ]) {
        await expectCode(fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/book`, options), 'invalidInput');
      }
    });
  });

  describe('timeout bounds', () => {
    it('aborts a hung transport before headers arrive', async () => {
      const transport = vi.fn(() => new Promise<never>(() => {}));
      const promise = fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/slow`, {
        maxBytes: 10_000,
        timeoutMs: 30,
        deps: { lookup: publicLookup, transport },
      });
      await expectCode(promise, 'fetchFailed');
    });

    it('covers a hung DNS resolution inside the same per-hop bound', async () => {
      const transport = vi.fn(() => new Promise<never>(() => {}));
      const lookup = vi.fn(() => new Promise<never>(() => {}));
      const promise = fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/slow-dns`, {
        maxBytes: 10_000,
        timeoutMs: 30,
        deps: { lookup, transport },
      });
      await expectCode(promise, 'fetchFailed');
      expect(transport).not.toHaveBeenCalled();
    });

    it('never starts the transport after a DNS timeout even when the resolver resolves later', async () => {
      vi.useFakeTimers();
      try {
        const transport = vi.fn(async () => {
          throw new Error('transport must not run after a DNS timeout');
        });
        let releaseLookup: ((answers: DnsAnswer[]) => void) | undefined;
        const lookup = vi.fn(
          () =>
            new Promise<DnsAnswer[]>((resolve) => {
              releaseLookup = resolve;
            }),
        );
        const promise = fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/late-dns`, {
          maxBytes: 10_000,
          timeoutMs: 50,
          deps: { lookup, transport },
        });
        const expectation = expect(promise).rejects.toMatchObject({
          name: 'SourceError',
          code: 'fetchFailed',
        });
        await vi.advanceTimersByTimeAsync(60);
        await expectation;
        releaseLookup?.([{ address: PUBLIC_IPV4, family: 4 }]);
        await vi.advanceTimersByTimeAsync(20);
        expect(transport).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('gives the transport only the remaining budget after DNS resolves', async () => {
      const budgets: number[] = [];
      const transport = vi.fn(async (request: { timeoutMs: number }) => {
        budgets.push(request.timeoutMs);
        return {
          status: 200,
          headers: { 'content-type': 'text/plain' },
          body: new TextEncoder().encode('ok'),
        };
      });
      const lookup = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return [{ address: PUBLIC_IPV4, family: 4 }];
      });
      await fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/budget`, {
        maxBytes: 10_000,
        timeoutMs: 200,
        deps: { lookup, transport },
      });
      expect(budgets).toHaveLength(1);
      expect(budgets[0]!).toBeLessThan(200);
      expect(budgets[0]!).toBeGreaterThan(0);
    });
  });

  describe('pinned default transport', () => {
    it('pins the validated address, keeps Host and TLS servername, streams the body', async () => {
      let captured: CapturedRequest | undefined;
      const pinnedResults: Array<{ all?: boolean; address: PinnedLookupAnswer; family?: number }> =
        [];
      let res: ResponseStub | undefined;
      httpsRequest.mockImplementationOnce(
        (options: CapturedRequest, cb: (r: ResponseStub) => void) => {
          captured = options;
          options.lookup('attacker.example', { all: true }, (err, address, family) => {
            pinnedResults.push({ all: true, address, family });
          });
          options.lookup('attacker.example', { all: false }, (err, address, family) => {
            pinnedResults.push({ all: false, address, family });
          });
          res = stubResponse(200, { 'content-type': 'text/html; charset=utf-8' });
          return stubRequest(cb, res, (target) => {
            target.emit('data', Buffer.from('<html>'));
            target.emit('data', Buffer.from('</html>'));
            target.emit('end');
          });
        },
      );
      const result = await fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/artikel`, {
        maxBytes: 10_000,
        deps: { lookup: publicLookup },
      });
      expect(publicLookup).toHaveBeenCalledTimes(1);
      expect(captured?.hostname).toBe(PUBLIC_HOSTNAME);
      expect(captured?.port).toBe(443);
      expect(captured?.servername).toBe(PUBLIC_HOSTNAME);
      expect(captured?.headers.Host).toBe(PUBLIC_HOSTNAME);
      expect(captured?.headers['Accept-Encoding']).toBe('identity');
      expect(captured?.headers.Cookie).toBeUndefined();
      expect(captured?.headers.Authorization).toBeUndefined();
      expect(captured?.agent).toBe(false);
      expect(pinnedResults).toEqual([
        { all: true, address: [{ address: PUBLIC_IPV4, family: 4 }] },
        { all: false, address: PUBLIC_IPV4, family: 4 },
      ]);
      expect(result.url).toBe(`https://${PUBLIC_HOSTNAME}/artikel`);
      expect(result.contentType).toBe('text/html');
      expect(Buffer.from(result.bytes).toString()).toBe('<html></html>');
      expect(res?.destroy).not.toHaveBeenCalled();
    });

    it('aborts and destroys the stream when the body exceeds maxBytes', async () => {
      let res: ResponseStub | undefined;
      httpsRequest.mockImplementationOnce(
        (_options: CapturedRequest, cb: (r: ResponseStub) => void) => {
          res = stubResponse(200, { 'content-type': 'text/plain' });
          return stubRequest(cb, res, (target) => {
            target.emit('data', Buffer.alloc(4000, 1));
          });
        },
      );
      const promise = fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/big`, {
        maxBytes: 1000,
        deps: { lookup: publicLookup },
      });
      await expectCode(promise, 'fileTooLarge');
      expect(res?.destroy).toHaveBeenCalled();
    });

    it('destroys the connection early when the declared length is oversized', async () => {
      let res: ResponseStub | undefined;
      httpsRequest.mockImplementationOnce(
        (_options: CapturedRequest, cb: (r: ResponseStub) => void) => {
          res = stubResponse(200, {
            'content-type': 'text/plain',
            'content-length': '5000',
          });
          return stubRequest(cb, res);
        },
      );
      await expectCode(
        fetchSafeUrl(`https://${PUBLIC_HOSTNAME}/big`, {
          maxBytes: 1000,
          deps: { lookup: publicLookup },
        }),
        'fileTooLarge',
      );
      expect(res?.destroy).toHaveBeenCalled();
    });
  });

  describe('isPublicAddress', () => {
    it('accepts global unicast and rejects every non-unicast range', () => {
      expect(isPublicAddress(PUBLIC_IPV4)).toBe(true);
      expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
      for (const address of [
        '127.0.0.1',
        '10.0.0.1',
        '172.16.0.1',
        '192.168.0.1',
        '169.254.169.254',
        '100.64.0.1',
        '0.0.0.0',
        '192.0.2.1',
        '198.51.100.1',
        '203.0.113.1',
        '224.0.0.1',
        '255.255.255.255',
        '::1',
        '::',
        'fe80::1',
        'fc00::1',
        'ff02::1',
        '2001:db8::1',
        '::ffff:10.0.0.1',
        '::ffff:8.8.8.8',
        'not-an-ip',
      ]) {
        expect(isPublicAddress(address)).toBe(false);
      }
    });
  });
});
