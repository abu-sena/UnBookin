import { describe, expect, it } from 'vitest';

import { chunkSource, CHARS_PER_TOKEN } from '@/lib/ingest/chunk';
import type { ExtractedPage } from '@/lib/ingest/extract';

function page(page: number, text: string, chapterTitle?: string): ExtractedPage {
  return chapterTitle === undefined ? { page, text } : { page, text, chapterTitle };
}

/** ~80 tokens is about 320 chars; allow the aligned-cut slack on top. */
const OVERLAP_PROBE_MAX = 360;

function paragraph(seed: string, words: number): string {
  return Array.from({ length: words }, (_, index) => `${seed}${index % 89}`).join(' ');
}

function bookPage(
  pageNumber: number,
  chapterTitle: string,
  paragraphSeeds: string[],
): ExtractedPage {
  return page(
    pageNumber,
    paragraphSeeds.map((seed) => paragraph(seed, 120)).join('\n\n'),
    chapterTitle,
  );
}

describe('chunkSource', () => {
  it('returns a single chunk with correct metadata for a short source', () => {
    const text = 'One short paragraph about learning.';
    const chunks = chunkSource([page(1, text)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      idx: 0,
      chapterTitle: null,
      pageFrom: 1,
      pageTo: 1,
      text,
    });
    expect(chunks[0]?.tokenCount).toBe(Math.ceil(text.length / CHARS_PER_TOKEN));
  });

  it('returns an empty array for an empty source', () => {
    expect(chunkSource([])).toEqual([]);
  });

  it('keeps chunks inside the token bounds with overlap between neighbours', () => {
    const pages = [
      bookPage(1, 'Chapter One', ['alpha', 'beta']),
      bookPage(2, 'Chapter One', ['gamma', 'delta']),
    ];
    const chunks = chunkSource(pages);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThan(0);
      expect(chunk.text.length).toBeGreaterThan(0);
    }
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.tokenCount).toBeGreaterThanOrEqual(550);
      expect(chunk.tokenCount).toBeLessThanOrEqual(950);
    }
    for (let i = 1; i < chunks.length; i += 1) {
      const previous = chunks[i - 1]!;
      const current = chunks[i]!;
      // Some contiguous suffix of the previous chunk reopens the next chunk.
      let overlapChars = 0;
      for (let k = 1; k <= OVERLAP_PROBE_MAX; k += 1) {
        if (previous.text.endsWith(current.text.slice(0, k))) overlapChars = k;
      }
      expect(overlapChars).toBeGreaterThan(0);
      // The chunk also continues with fresh content beyond the overlap.
      expect(current.text.length).toBeGreaterThan(overlapChars);
    }
    expect(chunks.map((chunk) => chunk.idx)).toEqual(chunks.map((_, index) => index));
  });

  it('never drops the final tail', () => {
    const tailSentence = 'The very final closing sentence about evidence.';
    const pages = [page(1, `${paragraph('omega', 800)}\n\n${tailSentence}`)];
    const chunks = chunkSource(pages);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[chunks.length - 1]?.text).toContain('The very final closing sentence');
  });

  it('maps chunks to real page spans', () => {
    const pages = [
      bookPage(1, 'One', ['a1', 'a2']),
      bookPage(2, 'Two', ['b1']),
      bookPage(3, 'Three', ['c1']),
    ];
    const chunks = chunkSource(pages);
    expect(chunks[0]?.pageFrom).toBe(1);
    expect(chunks[0]?.pageTo).toBeLessThanOrEqual(3);
    for (const chunk of chunks) {
      expect(chunk.pageFrom).toBeGreaterThanOrEqual(1);
      expect(chunk.pageTo).toBeGreaterThanOrEqual(chunk.pageFrom);
      expect(chunk.pageTo).toBeLessThanOrEqual(3);
    }
    expect(chunks[chunks.length - 1]?.pageTo).toBe(3);
  });

  it('carries the first chapter heading and tolerates missing headings', () => {
    const withHeadings = [
      page(1, `${paragraph('x1', 220)}\n\n${paragraph('x1b', 220)}`, 'Intro Chapter'),
      page(2, `${paragraph('x2', 220)}\n\n${paragraph('x2b', 220)}`, 'Deep Chapter'),
    ];
    const chunks = chunkSource(withHeadings);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]?.chapterTitle).toBe('Intro Chapter');
    expect(chunks[chunks.length - 1]?.chapterTitle).toBe('Deep Chapter');
    const withoutHeadings = chunkSource([page(1, paragraph('plain', 400))]);
    for (const chunk of withoutHeadings) {
      expect(chunk.chapterTitle).toBeNull();
    }
  });

  it('keeps a clear chapter boundary instead of filling to the minimum', () => {
    const pages = [
      page(1, paragraph('intro', 220), 'Short Chapter One'),
      page(2, paragraph('next', 220), 'Short Chapter Two'),
    ];
    const chunks = chunkSource(pages);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.chapterTitle).toBe('Short Chapter One');
    expect(chunks[1]?.chapterTitle).toBe('Short Chapter Two');
    expect(chunks[0]?.text).not.toContain('next0');
    expect(chunks[1]?.text).not.toContain('intro0');
    // Short chapter chunks are allowed; overlap never crosses the boundary.
    expect(chunks[0]?.tokenCount).toBeLessThan(600);
    expect(chunks[1]?.text.startsWith('next0')).toBe(true);
  });

  it('assigns synthetic sections near 2500 tokens for a chapterless source', () => {
    const pages = Array.from({ length: 30 }, (_, index) =>
      page(index + 1, paragraph(`section${index}`, 300)),
    );
    const chunks = chunkSource(pages);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) {
      expect(chunk.chapterTitle).toBeNull();
      expect(chunk.sectionIndex).toBeGreaterThanOrEqual(1);
    }
    const firstSection = chunks.filter((chunk) => chunk.sectionIndex === 1);
    const firstSectionTokens = firstSection.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
    expect(firstSectionTokens).toBeGreaterThanOrEqual(2500);
    expect(firstSectionTokens).toBeLessThan(2500 + 900);
    expect(chunks[chunks.length - 1]?.sectionIndex).toBeGreaterThan(1);
  });

  it('handles overlong unbroken tokens with forward progress', () => {
    const longToken = 'x'.repeat(5000);
    const chunks = chunkSource([page(1, longToken)]);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    let covered = 0;
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(950);
      covered += (chunk.text.match(/x/g) ?? []).length;
    }
    // Overlap duplicates some x characters, but every original x is covered.
    expect(covered).toBeGreaterThanOrEqual(5000);
    expect(chunks[chunks.length - 1]?.text).toContain('x');
  });

  it('terminates on unicode text and estimates tokens by chars', () => {
    const text = '学'.repeat(2000);
    const chunks = chunkSource([page(1, text)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain(text.slice(0, 400));
    expect(chunks[0]?.tokenCount).toBe(Math.ceil(chunks[0]!.text.length / CHARS_PER_TOKEN));
  });

  it('removes running headers, footers and standalone page numbers, not body paragraphs', () => {
    const bodyParagraph =
      'This substantial body paragraph repeats on every page and must always survive cleanup because it is long enough to be real content.';
    const pages = Array.from({ length: 5 }, (_, index) =>
      page(
        index + 1,
        [
          'My Running Header',
          bodyParagraph,
          `Page specific line for page ${index + 1} with unique words ${index + 7}.`,
          'My Running Footer',
          String(index + 1),
        ].join('\n'),
      ),
    );
    const chunks = chunkSource(pages);
    const all = chunks.map((chunk) => chunk.text).join('\n');
    expect(all).not.toContain('My Running Header');
    expect(all).not.toContain('My Running Footer');
    expect(all).not.toMatch(/(^|\n)\d+(\n|$)/);
    expect(all).toContain('This substantial body paragraph repeats');
    expect(all).toContain('Page specific line for page 3');
  });

  it('keeps a short repeated line on fewer than the majority of pages', () => {
    const lines = ['Occasional Marker', paragraph('body', 150)];
    const pages = [
      page(1, lines.join('\n')),
      page(2, paragraph('solo', 150)),
      page(3, paragraph('other', 150)),
    ];
    const chunks = chunkSource(pages);
    const all = chunks.map((chunk) => chunk.text).join('\n');
    expect(all).toContain('Occasional Marker');
  });

  it('does not treat sentences containing numbers as page numbers', () => {
    const pages = Array.from({ length: 4 }, (_, index) =>
      page(
        index + 1,
        `In ${1990 + index} the study concluded with strong evidence number ${index}.`,
      ),
    );
    const chunks = chunkSource(pages);
    const all = chunks.map((chunk) => chunk.text).join('\n');
    expect(all).toContain('the study concluded with strong evidence');
  });
});
