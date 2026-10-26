import type { ExtractedPage } from '@/lib/ingest/extract';

/**
 * Page-aware learning chunks (PRD 7.1 step 4). Pure module: no server-only
 * dependency, no DB/AI/billing side effects, importable from unit tests.
 *
 * Chunk text stays contiguous source text except for documented cleanup:
 *  - short standalone page-number lines (digits + punctuation only) are removed;
 *  - short lines repeated as the first/last line on a majority of >= 3 pages
 *    (running headers/footers) are removed at those edges only, so normal
 *    repeated body paragraphs survive;
 *  - paragraphs longer than MAX_BLOCK_CHARS are split at word boundaries
 *    (only overlong unbroken tokens are ever hard-cut).
 *
 * Token estimate: ceil(chars / 4) — a documented approximation (CHARS_PER_TOKEN).
 */

export type SourceChunkInput = {
  /** Sequential 0..N-1. */
  idx: number;
  /** First chapter heading governing this chunk, null when the source has none. */
  chapterTitle: string | null;
  /** Inclusive 1-based pseudo/PDF page span actually covered by the chunk. */
  pageFrom: number;
  pageTo: number;
  text: string;
  /** Estimated tokens: ceil(text.length / CHARS_PER_TOKEN). */
  tokenCount: number;
};

export const CHARS_PER_TOKEN = 4;
export const TARGET_TOKENS_MIN = 600;
export const TARGET_TOKENS_MAX = 900;
export const OVERLAP_TOKENS_TARGET = 80;
/** One paragraph never exceeds this; overlong unbroken tokens are hard-cut. */
export const MAX_BLOCK_CHARS = 1200;
const HEADER_FOOTER_MAX_CHARS = 80;
const HEADER_FOOTER_MIN_PAGES = 3;
const PAGE_NUMBER_LINE_MAX_CHARS = 30;
/** Token estimate for the '\n\n' separator between blocks. */
const SEPARATOR_TOKENS = 1;

type TextBlock = { text: string; page: number; chapterTitle: string | null };

type CleanedPage = { page: number; text: string; chapterTitle: string | null };

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** A standalone page number: short, contains a digit, and no letters. */
function isPageNumberLine(line: string): boolean {
  if (line.length === 0 || line.length > PAGE_NUMBER_LINE_MAX_CHARS) return false;
  if (!/\d/.test(line)) return false;
  return !/\p{L}/u.test(line);
}

function normalizeHeaderKey(line: string): string {
  return line.replace(/\s+/g, ' ').trim().toLowerCase();
}

function headerFooterKey(line: string): string | null {
  if (line.length === 0 || line.length > HEADER_FOOTER_MAX_CHARS) return null;
  const key = normalizeHeaderKey(line);
  return key.length > 0 ? key : null;
}

function removeEdgeLine(lines: string[], key: string, fromEnd: boolean): void {
  let index = -1;
  if (fromEnd) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (lines[i]!.length > 0) {
        index = i;
        break;
      }
    }
  } else {
    index = lines.findIndex((line) => line.length > 0);
  }
  if (index !== -1 && normalizeHeaderKey(lines[index]!) === key) lines.splice(index, 1);
}

/**
 * Remove running headers/footers: lines (short) that appear as the first or
 * last non-empty line on a strict majority of >= 3 pages. Removal happens at
 * those edge positions only, so repeated body paragraphs elsewhere survive.
 */
function cleanPageTexts(pages: ExtractedPage[]): CleanedPage[] {
  const lineLists = pages.map((page) => page.text.split('\n').map((line) => line.trim()));
  let cleaned = lineLists.map((lines) => lines.filter((line) => !isPageNumberLine(line)));
  if (pages.length >= HEADER_FOOTER_MIN_PAGES) {
    const counts = new Map<string, number>();
    for (const lines of cleaned) {
      const first = lines.find((line) => line.length > 0);
      let last: string | undefined;
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (lines[i]!.length > 0) {
          last = lines[i];
          break;
        }
      }
      for (const line of new Set([first, last])) {
        if (line === undefined) continue;
        const key = headerFooterKey(line);
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const removeKeys = new Set(
      [...counts.entries()].filter(([, count]) => count > pages.length / 2).map(([key]) => key),
    );
    if (removeKeys.size > 0) {
      cleaned = cleaned.map((lines) => {
        const withoutEdges = [...lines];
        for (const key of removeKeys) {
          removeEdgeLine(withoutEdges, key, false);
          removeEdgeLine(withoutEdges, key, true);
        }
        return withoutEdges;
      });
    }
  }
  return pages.map((page, index) => ({
    page: page.page,
    chapterTitle: page.chapterTitle ?? null,
    text: (cleaned[index] ?? [])
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  }));
}

/** Split one oversized paragraph at word boundaries; forward progress always. */
function hardSplitBlock(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) return [block];
  const pieces: string[] = [];
  let start = 0;
  while (start < block.length) {
    let end = Math.min(start + maxChars, block.length);
    if (end < block.length) {
      const window = block.slice(start, end);
      const cut = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));
      if (cut > maxChars / 2) end = start + cut + 1;
    }
    const piece = block.slice(start, end).trim();
    if (piece.length > 0) pieces.push(piece);
    start = end;
  }
  return pieces;
}

function prepareBlocks(pages: ExtractedPage[]): TextBlock[] {
  const blocks: TextBlock[] = [];
  for (const cleaned of cleanPageTexts(pages)) {
    for (const paragraph of cleaned.text.split(/\n{2,}/)) {
      for (const piece of hardSplitBlock(paragraph.trim(), MAX_BLOCK_CHARS)) {
        if (piece.length > 0) {
          blocks.push({
            text: piece,
            page: cleaned.page,
            chapterTitle: cleaned.chapterTitle,
          });
        }
      }
    }
  }
  return blocks;
}

/**
 * Longest word-boundary-aligned suffix of a chunk usable as the next chunk's
 * overlap (~OVERLAP_TOKENS_TARGET tokens). Empty when no clean cut exists.
 */
function overlapSuffix(text: string): string {
  const maxChars = OVERLAP_TOKENS_TARGET * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  const start = text.length - maxChars;
  const window = text.slice(start);
  const match = /\s/.exec(window);
  if (!match || match.index === undefined) return '';
  const suffix = text.slice(start + match.index + 1);
  return suffix.length > 0 ? suffix : '';
}

/**
 * Chunk page blocks into ~600-900 estimated token chunks with ~80-token
 * overlap. Chunks are sequential (idx 0..N-1), never empty, keep every word
 * except inside overlong unbroken tokens, never drop the tail (the final
 * chunk may be short), and carry the real page span and first chapter heading.
 */
export function chunkSource(pages: ExtractedPage[]): SourceChunkInput[] {
  const blocks = prepareBlocks(pages);
  const chunks: SourceChunkInput[] = [];
  let start = 0;
  let carry: { text: string; tokens: number; page: number } | null = null;
  while (start < blocks.length) {
    const parts: string[] = carry ? [carry.text] : [];
    let tokens = carry?.tokens ?? 0;
    let pageFrom = carry?.page ?? Number.POSITIVE_INFINITY;
    let pageTo = 0;
    let chapterTitle: string | null = null;
    let end = start;
    // Accumulate until at least TARGET_TOKENS_MIN estimated tokens; every
    // block adds at least one token, so end always advances past start.
    while (end < blocks.length && tokens < TARGET_TOKENS_MIN) {
      const block = blocks[end]!;
      parts.push(block.text);
      tokens += estimateTokens(block.text) + SEPARATOR_TOKENS;
      pageFrom = Math.min(pageFrom, block.page);
      pageTo = Math.max(pageTo, block.page);
      if (chapterTitle === null && block.chapterTitle !== null) chapterTitle = block.chapterTitle;
      end += 1;
    }
    // Extend with following blocks while the chunk stays within the ceiling.
    while (end < blocks.length) {
      const block = blocks[end]!;
      const addition = estimateTokens(block.text) + SEPARATOR_TOKENS;
      if (tokens + addition > TARGET_TOKENS_MAX) break;
      parts.push(block.text);
      tokens += addition;
      pageFrom = Math.min(pageFrom, block.page);
      pageTo = Math.max(pageTo, block.page);
      if (chapterTitle === null && block.chapterTitle !== null) chapterTitle = block.chapterTitle;
      end += 1;
    }
    const text = parts.join('\n\n');
    if (text.length > 0) {
      chunks.push({
        idx: chunks.length,
        chapterTitle,
        pageFrom,
        pageTo,
        text,
        tokenCount: estimateTokens(text),
      });
    }
    if (end >= blocks.length) break;
    const overlap = overlapSuffix(text);
    carry =
      overlap.length > 0 ? { text: overlap, tokens: estimateTokens(overlap), page: pageTo } : null;
    start = end;
  }
  return chunks;
}
