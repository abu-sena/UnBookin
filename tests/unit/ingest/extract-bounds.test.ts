// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSafeUrl: vi.fn(),
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
  getMeta: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ingest/safe-url', () => ({ fetchSafeUrl: mocks.fetchSafeUrl }));

// unpdf is partially mocked with only the three functions extract.ts imports:
// outline-bound tests inject a fake proxy whose getOutline/getPageIndex are
// spies, so a hostile multi-thousand-node outline is exercised without pdf.js.
vi.mock('unpdf', () => ({
  getDocumentProxy: mocks.getDocumentProxy,
  extractText: mocks.extractText,
  getMeta: mocks.getMeta,
}));

import { extractSource } from '@/lib/ingest/extract';
import { type SourceErrorCode } from '@/lib/sources/errors';

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function expectSourceError(promise: Promise<unknown>, code: SourceErrorCode): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'SourceError', code });
}

//#region fake pdf proxy

type FakeFn = ReturnType<typeof vi.fn>;

type FakePdfProxy = {
  numPages: number;
  getOutline: FakeFn;
  getDestination: FakeFn;
  getPageIndex: FakeFn;
};

/**
 * One-page proxy whose outline is fully controlled by the test. Every
 * reference destination resolves to page 9999, far beyond numPages, so it is
 * invalid and never yields a chapter range; getPageIndex doubles as the
 * destination-lookup counter.
 */
function buildFakeProxy(numPages: number, outline: unknown[]): FakePdfProxy {
  return {
    numPages,
    getOutline: vi.fn().mockResolvedValue(outline),
    getDestination: vi.fn().mockResolvedValue(null),
    getPageIndex: vi.fn().mockResolvedValue(9999),
  };
}

function mockSinglePagePdf(proxy: FakePdfProxy): void {
  mocks.getDocumentProxy.mockResolvedValue(proxy);
  mocks.extractText.mockResolvedValue({ text: ['Alpha page one content.'] });
  mocks.getMeta.mockResolvedValue({ info: {} });
}

//#endregion

beforeEach(() => {
  mocks.fetchSafeUrl.mockReset();
  mocks.getDocumentProxy.mockReset();
  mocks.extractText.mockReset();
  mocks.getMeta.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractSource bounds: pdf outline', () => {
  it('caps destination lookups for a 5000-node outline of invalid destinations', async () => {
    const outline = Array.from({ length: 5000 }, (_, index) => ({
      title: `Ghost Chapter ${index + 1}`,
      dest: [{ num: 900000 + index }, '/Fit'],
    }));
    const proxy = buildFakeProxy(1, outline);
    mockSinglePagePdf(proxy);
    const source = await extractSource({
      type: 'pdf',
      bytes: textBytes('%PDF-1.4 stub'),
      maxPages: 60,
      maxBytes: 1_000_000,
    });
    // Every visited node counts, valid or not: 5000 hostile entries must never
    // turn into more than the 1000-node visit bound of destination lookups.
    const lookups = proxy.getPageIndex.mock.calls.length;
    expect(lookups).toBeGreaterThan(0);
    expect(lookups).toBeLessThanOrEqual(1000);
    // Invalid destinations never fail or starve extraction of real text.
    expect(source.pageCount).toBe(1);
    expect(source.pages[0]?.text).toContain('Alpha page one content.');
    expect(source.wordCount).toBeGreaterThan(0);
    expect(source.pages[0]?.chapterTitle).toBeUndefined();
  });

  it('ignores deep children once the enqueue cap is exhausted and keeps counters bounded', async () => {
    const topCount = 40;
    const childCount = 30;
    const survivor = { title: 'Deep Valid Survivor', dest: [0] };
    const outline = Array.from({ length: topCount }, (_, top) => ({
      title: `Part ${top + 1}`,
      dest: [{ num: 900000 + top }, '/Fit'],
      items: Array.from({ length: childCount }, (_, child) =>
        top === topCount - 1 && child === 0
          ? survivor
          : {
              title: `Ghost ${top + 1}.${child + 1}`,
              dest: [{ num: 900000 + top * 100 + child }, '/Fit'],
            },
      ),
    }));
    const proxy = buildFakeProxy(1, outline);
    mockSinglePagePdf(proxy);
    const source = await extractSource({
      type: 'pdf',
      bytes: textBytes('%PDF-1.4 stub'),
      maxPages: 60,
      maxBytes: 1_000_000,
    });
    const lookups = proxy.getPageIndex.mock.calls.length;
    expect(lookups).toBeGreaterThan(0);
    expect(lookups).toBeLessThanOrEqual(1000);
    expect(lookups).toBeLessThan(topCount * (childCount + 1));
    // The one valid destination sits in the last, never-enqueued subtree: it
    // must never resolve and no chapter may be invented from it.
    expect(source.pages[0]?.chapterTitle).toBeUndefined();
    expect(source.pages[0]?.text).toContain('Alpha page one content.');
  });
});

describe('extractSource bounds: inclusive pseudo page limit', () => {
  it('accepts exactly maxPages*300 meaningful units on a 1-page limit', async () => {
    const body = Array.from({ length: 300 }, (_, index) => `word${index}`).join(' ');
    const source = await extractSource({
      type: 'text',
      bytes: textBytes(body),
      maxPages: 1,
      maxBytes: 100_000,
    });
    expect(source.wordCount).toBe(300);
    expect(source.pageCount).toBe(1);
    expect(source.pages).toHaveLength(1);
  });

  it('rejects 301 meaningful units on a 1-page limit with pagesExceeded', async () => {
    const body = Array.from({ length: 301 }, (_, index) => `word${index}`).join(' ');
    await expectSourceError(
      extractSource({ type: 'text', bytes: textBytes(body), maxPages: 1, maxBytes: 100_000 }),
      'pagesExceeded',
    );
  });

  it('counts mixed CJK and latin units inclusively at the 300-unit boundary', async () => {
    const body = `${Array.from({ length: 299 }, (_, index) => `word${index}`).join(' ')} 学`;
    const source = await extractSource({
      type: 'text',
      bytes: textBytes(body),
      maxPages: 1,
      maxBytes: 100_000,
    });
    // 299 letter runs + 1 CJK character = exactly the inclusive unit bound.
    expect(source.wordCount).toBe(300);
    expect(source.pageCount).toBe(1);
    expect(source.pages[0]?.text).toContain('学');
  });

  it('rejects a 200k-word source within maxBytes before any AI step', async () => {
    const body = Array.from({ length: 200_000 }, (_, index) => `w${index % 1000}`).join(' ');
    const bytes = textBytes(body);
    expect(bytes.byteLength).toBeLessThan(5_000_000);
    // Tokenization throws at the 301st unit, so the remaining words of this
    // oversized source are never tokenized; rejection itself is the bound.
    await expectSourceError(
      extractSource({ type: 'text', bytes, maxPages: 1, maxBytes: 10_000_000 }),
      'pagesExceeded',
    );
  });
});
