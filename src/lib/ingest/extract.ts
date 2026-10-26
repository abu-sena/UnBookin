import 'server-only';

import { Readability } from '@mozilla/readability';
import { unzipSync, type UnzipFileInfo } from 'fflate';
import { DOMParser, parseHTML } from 'linkedom';
import { extractText, getDocumentProxy, getMeta } from 'unpdf';
import { fetchSafeUrl } from '@/lib/ingest/safe-url';
import { SourceError } from '@/lib/sources/errors';

/**
 * Server-side source extraction (PRD 7.1 step 1, E2-01 AC4/AC5).
 *
 * Every failure is a safe `SourceError` code; vendor messages, source text and
 * raw URLs are never logged or propagated. All parsing is inert: HTML/XML are
 * parsed into a DOM that is never rendered, scripts are never executed and no
 * resource referenced by a document is ever fetched. Nothing is written to
 * disk; ZIP entries are inflated in memory only, and only text-like entries.
 */

export type ExtractedPage = {
  /** 1-based page reference. PDF: actual page. EPUB/URL/text: pseudo page. */
  page: number;
  /** Normalized plain text of the page (paragraphs separated by blank lines). */
  text: string;
  /** Chapter heading governing this page, when one was detected. */
  chapterTitle?: string;
};

export type ExtractedSource = {
  pages: ExtractedPage[];
  pageCount: number;
  wordCount: number;
  title?: string;
  author?: string;
};

export type ExtractSourceType = 'pdf' | 'epub' | 'url' | 'text';

export type ExtractSourceInput = {
  type: ExtractSourceType;
  /** Raw source bytes (PDF/EPUB binary; UTF-8 text for the `text` type). */
  bytes?: Uint8Array;
  /** Public article URL for the `url` type. */
  url?: string;
  /** Inclusive page limit; the source is rejected before AI processing. */
  maxPages: number;
  /** Hard byte limit for the raw source. */
  maxBytes: number;
};

/** PRD 7.5: EPUB/URL pages are counted as word_count / 300. */
const WORDS_PER_PAGE = 300;
/** Safety cap so one pathological paragraph cannot create a huge pseudo page. */
const MAX_PSEUDO_BLOCK_CHARS = 1200;
const MAX_PSEUDO_PAGE_CHARS = 4000;
const META_MAX_CHARS = 300;
const CHAPTER_TITLE_MAX_CHARS = 200;
/** Hard wall-clock bound for one PDF extraction (bounded pipeline). */
const PDF_EXTRACTION_TIMEOUT_MS = 30_000;
const PDF_META_BUDGET_MS = 2_000;
/** pdf.js hardening: no evaluation of embedded JS, bounded image allocation. */
const PDF_JS_OPTIONS = {
  isEvalSupported: false,
  maxImageSize: 16_777_216,
} as NonNullable<Parameters<typeof getDocumentProxy>[1]>;

const ZIP64_SIZE_SENTINEL = 0xffff_ffff;
const ZIP_MAX_ENTRIES = 5000;
const EPUB_MIMETYPE = 'application/epub+zip';
const EPUB_TEXT_ENTRY_MAX_BYTES = 8 * 1024 * 1024;
const EPUB_INFLATED_AGGREGATE_MAX_BYTES = 64 * 1024 * 1024;
const EPUB_TEXT_EXTENSIONS = new Set(['xml', 'xhtml', 'html', 'htm', 'opf', 'ncx', 'txt']);

const PDF_MAGIC = '%PDF-';

type ChapterDraft = { title: string | null; blocks: string[] };

//#region shared text helpers

/** Normalize extracted text: unify newlines, drop null/control/zero-width chars. */
function normalizeSourceText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f\ufeff]/g, '')
    .replace(/[\u000b\u000c]/g, ' ')
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const WORD_RUN = /[\p{L}\p{N}]+/gu;

/**
 * Unicode-aware meaningful word count: CJK ideographs/kana/hangul count per
 * character (they carry their own meaning), everything else counts letter and
 * digit runs. Empty or symbol-only text yields 0, which callers map to `noText`.
 */
function countMeaningfulWords(text: string): number {
  const cjk = text.match(CJK_CHAR)?.length ?? 0;
  const rest = text.replace(CJK_CHAR, ' ');
  return cjk + (rest.match(WORD_RUN)?.length ?? 0);
}

function decodeUtf8Fatal(
  bytes: Uint8Array,
  errorCode: 'invalidInput' | 'fetchFailed' | 'processingFailed',
): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SourceError(errorCode);
  }
}

function cleanMeta(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, META_MAX_CHARS);
}

function splitIntoBlocks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

/**
 * Split one oversized paragraph at word boundaries. Only paragraphs above the
 * cap (and, inside them, overlong unbroken tokens) are ever cut; ordinary
 * words are never broken, and every cut makes forward progress.
 */
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

//#endregion

//#region pseudo pages (EPUB / URL / text)

/**
 * Pack chapter blocks into exactly `max(1, ceil(wordCount / 300))` pseudo
 * pages in reading order (PRD 7.5). The last page absorbs the remainder; page
 * strings stay bounded because blocks are pre-split at MAX_PSEUDO_BLOCK_CHARS.
 */
function pseudoPagesFromChapters(chapters: ChapterDraft[], wordCount: number): ExtractedPage[] {
  const pageCount = Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE));
  type Entry = { text: string; words: number; title: string | null };
  const entries: Entry[] = [];
  for (const chapter of chapters) {
    for (const block of chapter.blocks) {
      entries.push({ text: block, words: countMeaningfulWords(block), title: chapter.title });
    }
  }
  const pages: ExtractedPage[] = [];
  let cursor = 0;
  for (let pageIdx = 0; pageIdx < pageCount && cursor < entries.length; pageIdx += 1) {
    const target = ((pageIdx + 1) * wordCount) / pageCount;
    const isLastPage = pageIdx === pageCount - 1;
    const parts: string[] = [];
    let words = 0;
    let chars = 0;
    let pageTitle: string | null | undefined;
    while (cursor < entries.length) {
      const entry = entries[cursor]!;
      const entriesLeft = entries.length - cursor;
      const pagesRemainingAfter = pageCount - pageIdx - 1;
      if (
        !isLastPage &&
        parts.length > 0 &&
        (words >= target ||
          chars + entry.text.length > MAX_PSEUDO_PAGE_CHARS ||
          entriesLeft <= pagesRemainingAfter)
      ) {
        break;
      }
      if (pageTitle === undefined) pageTitle = entry.title;
      parts.push(entry.text);
      words += entry.words;
      chars += entry.text.length;
      cursor += 1;
    }
    const page: ExtractedPage = { page: pageIdx + 1, text: parts.join('\n\n') };
    if (pageTitle) page.chapterTitle = pageTitle;
    pages.push(page);
  }
  return pages;
}

function finishPseudoSource(
  chapters: ChapterDraft[],
  maxPages: number,
  meta?: { title?: string; author?: string },
): ExtractedSource {
  const fullText = chapters.map((chapter) => chapter.blocks.join('\n\n')).join('\n\n');
  const wordCount = countMeaningfulWords(fullText);
  if (wordCount === 0) throw new SourceError('noText');
  const pageCount = Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE));
  // Inclusive maxPages is validated before any AI step may run on the source.
  if (pageCount > maxPages) throw new SourceError('pagesExceeded');
  const pages = pseudoPagesFromChapters(chapters, wordCount);
  const source: ExtractedSource = { pages, pageCount: pages.length, wordCount };
  if (meta?.title) source.title = meta.title;
  if (meta?.author) source.author = meta.author;
  return source;
}

function finishSingleChapter(text: string, maxPages: number): ExtractedSource {
  const blocks = splitIntoBlocks(text).flatMap((block) =>
    hardSplitBlock(block, MAX_PSEUDO_BLOCK_CHARS),
  );
  return finishPseudoSource([{ title: null, blocks }], maxPages);
}

//#endregion

//#region PDF

function isPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i += 1) {
    if (bytes[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

function withDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) return Promise.reject(new SourceError('processingFailed'));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SourceError('processingFailed')), remaining);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof SourceError ? error : new SourceError('processingFailed'));
      },
    );
  });
}

/** Release the pdf.js loading task; tolerate partial teardown of odd builds. */
async function destroyPdfProxy(proxy: unknown): Promise<void> {
  if (!proxy || typeof proxy !== 'object') return;
  const holder = proxy as {
    loadingTask?: { destroy?: () => Promise<unknown> };
    cleanup?: () => void;
  };
  const task = holder.loadingTask;
  if (task && typeof task.destroy === 'function') {
    try {
      await task.destroy();
    } catch {
      // best-effort release; nothing may leak to callers
    }
    return;
  }
  if (typeof holder.cleanup === 'function') {
    try {
      holder.cleanup();
    } catch {
      // best-effort release; nothing may leak to callers
    }
  }
}

async function extractPdfSource(
  bytes: Uint8Array,
  maxBytes: number,
  maxPages: number,
): Promise<ExtractedSource> {
  if (bytes.byteLength > maxBytes) throw new SourceError('fileTooLarge');
  if (!isPdfMagic(bytes)) throw new SourceError('fileType');
  const deadline = Date.now() + PDF_EXTRACTION_TIMEOUT_MS;
  let proxy: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    proxy = await withDeadline(getDocumentProxy(bytes, PDF_JS_OPTIONS), deadline);
    const numPages = proxy.numPages;
    if (!Number.isSafeInteger(numPages) || numPages < 1) throw new SourceError('fileType');
    // Page limit is enforced BEFORE text extraction runs.
    if (numPages > maxPages) throw new SourceError('pagesExceeded');
    const extracted = await withDeadline(extractText(proxy, { mergePages: false }), deadline);
    let title: string | undefined;
    let author: string | undefined;
    try {
      const meta = await withDeadline(
        getMeta(proxy, { parseDates: false }),
        Math.min(deadline, Date.now() + PDF_META_BUDGET_MS),
      );
      title = cleanMeta(meta.info?.Title);
      author = cleanMeta(meta.info?.Author);
    } catch {
      // metadata is optional; a broken Info dictionary never fails extraction
    }
    const pageTexts = typeof extracted.text === 'string' ? [extracted.text] : extracted.text;
    const pages: ExtractedPage[] = pageTexts.map((text, index) => ({
      page: index + 1,
      text: normalizeSourceText(text),
    }));
    const wordCount = countMeaningfulWords(pages.map((page) => page.text).join('\n'));
    if (wordCount === 0) throw new SourceError('noText');
    const source: ExtractedSource = { pages, pageCount: pages.length, wordCount };
    if (title) source.title = title;
    if (author) source.author = author;
    return source;
  } finally {
    await destroyPdfProxy(proxy);
  }
}

//#endregion

//#region EPUB

function isZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * Normalize an archive path or href to a POSIX path inside the virtual ZIP
 * root. Returns null for anything unsafe: absolute paths, drive letters,
 * schemes, backslashes, control characters, and `..` that would escape the
 * root. Contained `..` (e.g. `OEBPS/../Text/ch1.xhtml`) resolves normally so
 * ordinary EPUB layouts are not falsely rejected.
 */
function normalizeArchivePath(name: string): string | null {
  if (name.length === 0 || name.length > 1024) return null;
  if (name.includes('\\') || /[\u0000-\u001f]/.test(name)) return null;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name) || /^[\w+.-]+:\/\//.test(name)) return null;
  const parts: string[] = [];
  for (const part of name.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  if (parts.length === 0) return null;
  return parts.join('/');
}

function isTextEntry(normalizedName: string): boolean {
  if (normalizedName === 'mimetype') return true;
  const dot = normalizedName.lastIndexOf('.');
  if (dot <= 0 || dot === normalizedName.length - 1) return false;
  return EPUB_TEXT_EXTENSIONS.has(normalizedName.slice(dot + 1).toLowerCase());
}

type ZipEntries = Map<string, Uint8Array>;

/**
 * Inflate ONLY text-like entries. The fflate filter runs on the central
 * directory before any allocation: entry count, entry-name safety, ZIP64
 * sentinels, per-entry size and the inflated aggregate are all enforced there,
 * and images/fonts/binaries are skipped without inflating. Actual inflated
 * bytes are re-counted afterwards (declared sizes are never trusted).
 */
function inflateTextEntries(bytes: Uint8Array, maxBytes: number): ZipEntries {
  const aggregateLimit = Math.min(EPUB_INFLATED_AGGREGATE_MAX_BYTES, maxBytes * 10);
  const seen = new Set<string>();
  let entryCount = 0;
  let aggregate = 0;
  const files = unzipSync(bytes, {
    filter: (file: UnzipFileInfo) => {
      entryCount += 1;
      if (entryCount > ZIP_MAX_ENTRIES) throw new SourceError('invalidInput');
      const normalized = normalizeArchivePath(file.name);
      if (!normalized) throw new SourceError('invalidInput');
      if (seen.has(normalized)) throw new SourceError('invalidInput');
      seen.add(normalized);
      if (
        file.originalSize === ZIP64_SIZE_SENTINEL ||
        !Number.isSafeInteger(file.originalSize) ||
        file.originalSize < 0
      ) {
        throw new SourceError('fileTooLarge');
      }
      if (!isTextEntry(normalized)) return false;
      if (file.compression !== 0 && file.compression !== 8) return false;
      if (file.originalSize > EPUB_TEXT_ENTRY_MAX_BYTES) throw new SourceError('fileTooLarge');
      aggregate += file.originalSize;
      if (aggregate > aggregateLimit) throw new SourceError('fileTooLarge');
      return true;
    },
  });
  const entries: ZipEntries = new Map();
  let inflated = 0;
  for (const [name, data] of Object.entries(files)) {
    inflated += data.byteLength;
    const normalized = normalizeArchivePath(name);
    if (!normalized) throw new SourceError('invalidInput');
    entries.set(normalized, data);
  }
  if (inflated > aggregateLimit) throw new SourceError('fileTooLarge');
  return entries;
}

function assertMetadataXmlHasNoDoctype(xml: string): void {
  // Metadata XML (container.xml, OPF) must never declare a DOCTYPE; entity
  // injection and custom DTDs are rejected outright, nothing is ever fetched.
  if (/<!doctype[\s>]/i.test(xml)) throw new SourceError('invalidInput');
  if (/<!entity/i.test(xml)) throw new SourceError('invalidInput');
}

function xmlElementsByLocalName(root: Node, localName: string): Element[] {
  const wanted = localName.toLowerCase();
  const out: Element[] = [];
  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      const tag = element.tagName ?? '';
      const bare = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;
      if (bare.toLowerCase() === wanted) out.push(element);
      visit(child);
    }
  };
  visit(root);
  return out;
}

function xmlAttribute(element: Element, name: string): string | null {
  const value = element.getAttribute(name);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function xmlFirstText(root: Node, localName: string): string | null {
  for (const element of xmlElementsByLocalName(root, localName)) {
    const text = element.textContent ?? '';
    if (text.trim().length > 0) return text;
  }
  return null;
}

function parseXmlDocument(xml: string): Document {
  const parsed = new DOMParser().parseFromString(xml, 'text/xml');
  return parsed as unknown as Document;
}

/**
 * Resolve an OPF href against the OPF directory inside the virtual ZIP root.
 * Relative paths (including contained `../`) are allowed; absolute paths,
 * remote URLs and root escapes are rejected. Nothing is ever decoded to a real
 * filesystem path.
 */
function resolveEpubHref(baseDir: string, href: string): string | null {
  if (href.length === 0 || href.length > 1024) return null;
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    decoded = href;
  }
  if (decoded.includes('\\') || /[\u0000-\u001f]/.test(decoded)) return null;
  if (decoded.startsWith('/') || /^[a-zA-Z]:/.test(decoded) || /^[\w+.-]+:\/\//.test(decoded)) {
    return null;
  }
  const combined = baseDir.length > 0 ? `${baseDir}/${decoded}` : decoded;
  return normalizeArchivePath(combined);
}

function posixDirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/**
 * Chapter markup may carry inert doctype declarations. Benign `<!doctype html>`
 * and standard W3C XHTML PUBLIC declarations are stripped before inert HTML
 * parsing (an external DTD is never fetched). ENTITY declarations, internal
 * subsets and any custom DTD are rejected instead of failing ordinary chapters.
 */
function stripInertDoctype(markup: string): string {
  if (/<!entity/i.test(markup)) throw new SourceError('invalidInput');
  const match = /<!doctype[^>]*>/i.exec(markup);
  if (!match) return markup;
  const declaration = match[0];
  if (declaration.includes('[')) throw new SourceError('invalidInput');
  const benign =
    /^<!doctype\s+html\s*>$/i.test(declaration) ||
    /^<!doctype\s+html\s+public\s+"-\s*\/\/W3C\/\/DTD XHTML[\s\S]*"(\s*"[\s\S]*")?\s*>$/i.test(
      declaration,
    );
  if (!benign) throw new SourceError('invalidInput');
  return markup.slice(0, match.index) + markup.slice(match.index + declaration.length);
}

// Elements whose entire subtree is dropped from extracted text. Inert: the
// DOM is only walked for text, nothing is rendered or executed.
const HTML_SKIP_TAGS = new Set([
  'script',
  'style',
  'nav',
  'head',
  'noscript',
  'template',
  'svg',
  'iframe',
  'object',
  'embed',
  'form',
  'button',
  'select',
  'input',
  'textarea',
  'link',
  'meta',
]);

const HTML_BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'thead',
  'tfoot',
  'tr',
  'ul',
]);

/** Walk an inert DOM and serialize it to plain text with block spacing. */
function htmlToText(root: Node): string {
  let out = '';
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      out += node.nodeValue ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const tag = (element.tagName ?? '').toLowerCase();
    if (HTML_SKIP_TAGS.has(tag)) return;
    if (tag === 'br') {
      out += '\n';
      return;
    }
    const isBlock = HTML_BLOCK_TAGS.has(tag);
    if (tag === 'td' || tag === 'th') out += ' ';
    if (isBlock) out += '\n\n';
    for (const child of Array.from(element.childNodes)) visit(child);
    if (isBlock) out += '\n\n';
  };
  for (const child of Array.from(root.childNodes)) visit(child);
  return out;
}

function parseHtmlInertly(markup: string): Document | null {
  try {
    const window = parseHTML(markup);
    return (window.document ?? null) as unknown as Document | null;
  } catch {
    return null;
  }
}

function firstChapterHeading(document: Document): string | null {
  const headings = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
  for (const heading of Array.from(headings)) {
    const text = normalizeSourceText(heading.textContent ?? '');
    if (text.length > 0) return text.slice(0, CHAPTER_TITLE_MAX_CHARS);
  }
  return null;
}

function chapterFromMarkup(markup: string): ChapterDraft {
  const stripped = stripInertDoctype(markup);
  const document = parseHtmlInertly(stripped);
  if (!document || !document.documentElement) throw new SourceError('invalidInput');
  const title = firstChapterHeading(document);
  const root: Node = document.body ?? document.documentElement;
  const text = normalizeSourceText(htmlToText(root));
  const blocks = splitIntoBlocks(text).flatMap((block) =>
    hardSplitBlock(block, MAX_PSEUDO_BLOCK_CHARS),
  );
  return { title, blocks };
}

async function extractEpubSource(
  bytes: Uint8Array,
  maxBytes: number,
  maxPages: number,
): Promise<ExtractedSource> {
  if (bytes.byteLength > maxBytes) throw new SourceError('fileTooLarge');
  if (!isZipSignature(bytes)) throw new SourceError('fileType');
  const entries = inflateTextEntries(bytes, maxBytes);
  const mimetypeEntry = entries.get('mimetype');
  const mimetype =
    mimetypeEntry !== undefined ? new TextDecoder().decode(mimetypeEntry).trim() : '';
  if (mimetype !== EPUB_MIMETYPE) throw new SourceError('fileType');

  const containerRaw = entries.get('META-INF/container.xml');
  if (containerRaw === undefined) throw new SourceError('fileType');
  const containerXml = decodeUtf8Fatal(containerRaw, 'invalidInput');
  assertMetadataXmlHasNoDoctype(containerXml);
  const containerDoc = parseXmlDocument(containerXml);
  const rootElement = containerDoc.documentElement;
  if (!rootElement) throw new SourceError('fileType');
  const rootfilePath = xmlElementsByLocalName(rootElement, 'rootfile')
    .map((element) => xmlAttribute(element, 'full-path'))
    .find((value): value is string => value !== null);
  if (!rootfilePath) throw new SourceError('fileType');
  const opfPath = normalizeArchivePath(rootfilePath);
  if (!opfPath) throw new SourceError('invalidInput');
  const opfRaw = entries.get(opfPath);
  if (opfRaw === undefined) throw new SourceError('fileType');

  const opfXml = decodeUtf8Fatal(opfRaw, 'invalidInput');
  assertMetadataXmlHasNoDoctype(opfXml);
  const opfDoc = parseXmlDocument(opfXml);
  const opfElement = opfDoc.documentElement;
  if (!opfElement) throw new SourceError('invalidInput');

  const manifest = new Map<string, { href: string; mediaType: string }>();
  for (const item of xmlElementsByLocalName(opfElement, 'item')) {
    const id = xmlAttribute(item, 'id');
    const href = xmlAttribute(item, 'href');
    if (id && href) manifest.set(id, { href, mediaType: xmlAttribute(item, 'media-type') ?? '' });
  }
  const spineIdrefs = xmlElementsByLocalName(opfElement, 'itemref')
    .map((element) => xmlAttribute(element, 'idref'))
    .filter((idref): idref is string => idref !== null);
  if (spineIdrefs.length === 0) throw new SourceError('invalidInput');

  const opfDir = posixDirname(opfPath);
  const chapters: ChapterDraft[] = [];
  // Spine order defines reading order, not filename order.
  for (const idref of spineIdrefs) {
    const item = manifest.get(idref);
    if (!item) throw new SourceError('invalidInput');
    const entryPath = resolveEpubHref(opfDir, item.href);
    if (!entryPath) throw new SourceError('invalidInput');
    const data = entries.get(entryPath);
    if (data === undefined) throw new SourceError('invalidInput');
    if (!/xhtml|html/i.test(item.mediaType)) continue;
    const chapter = chapterFromMarkup(decodeUtf8Fatal(data, 'invalidInput'));
    if (chapter.blocks.length > 0) chapters.push(chapter);
  }

  const meta: { title?: string; author?: string } = {};
  meta.title = cleanMeta(xmlFirstText(opfElement, 'title'));
  meta.author = cleanMeta(xmlFirstText(opfElement, 'creator'));
  return finishPseudoSource(chapters, maxPages, meta);
}

//#endregion

//#region URL

async function extractUrlSource(
  url: string,
  maxBytes: number,
  maxPages: number,
): Promise<ExtractedSource> {
  // All network policy (SSRF, redirects, size, content types) lives in the
  // frozen safe-url module; this module only parses the bounded result.
  const fetched = await fetchSafeUrl(url, { maxBytes });
  if (fetched.contentType === 'text/plain') {
    const raw = decodeUtf8Fatal(fetched.bytes, 'fetchFailed');
    return finishSingleChapter(normalizeSourceText(raw), maxPages);
  }
  const markup = decodeUtf8Fatal(fetched.bytes, 'processingFailed');
  const document = parseHtmlInertly(markup);
  if (!document || !document.documentElement) throw new SourceError('fetchFailed');
  // Capture the cleaned body BEFORE Readability mutates the document, so it
  // can serve as the fallback when no article is detected.
  const fallbackRoot: Node = document.body ?? document.documentElement;
  const fallbackText = normalizeSourceText(htmlToText(fallbackRoot));
  let articleTitle: string | undefined;
  let articleAuthor: string | undefined;
  let articleText = '';
  try {
    const article = new Readability(document as unknown as Document).parse();
    if (article) {
      articleText = typeof article.textContent === 'string' ? article.textContent : '';
      articleTitle = cleanMeta(article.title);
      articleAuthor = cleanMeta(article.byline);
    }
  } catch {
    // fall back to the cleaned body text below
  }
  const text = articleText.length > 0 ? normalizeSourceText(articleText) : fallbackText;
  const title = articleTitle ?? cleanMeta(document.title);
  const source = finishSingleChapter(text, maxPages);
  if (title) source.title = title;
  if (articleAuthor) source.author = articleAuthor;
  return source;
}

//#endregion

//#region text

function extractTextSource(bytes: Uint8Array, maxBytes: number, maxPages: number): ExtractedSource {
  if (bytes.byteLength > maxBytes) throw new SourceError('fileTooLarge');
  const raw = decodeUtf8Fatal(bytes, 'invalidInput');
  return finishSingleChapter(normalizeSourceText(raw), maxPages);
}

//#endregion

/**
 * Extract bounded plain text with page-aware references from one approved
 * source. Server-only; every failure is a safe `SourceError` code and nothing
 * is logged. `pages` is never empty for a returned source and page references
 * are 1-based and contiguous.
 */
export async function extractSource(input: ExtractSourceInput): Promise<ExtractedSource> {
  if (!input || typeof input !== 'object') throw new SourceError('invalidInput');
  const { type, bytes, url, maxPages, maxBytes } = input;
  if (type !== 'pdf' && type !== 'epub' && type !== 'url' && type !== 'text') {
    throw new SourceError('invalidInput');
  }
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new SourceError('invalidInput');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new SourceError('invalidInput');
  if (type !== 'url' && (!(bytes instanceof Uint8Array) || bytes.byteLength === 0)) {
    throw new SourceError('invalidInput');
  }
  switch (type) {
    case 'pdf':
      return extractPdfSource(bytes!, maxBytes, maxPages);
    case 'epub':
      return extractEpubSource(bytes!, maxBytes, maxPages);
    case 'url':
      if (typeof url !== 'string' || url.length === 0) throw new SourceError('invalidUrl');
      return extractUrlSource(url, maxBytes, maxPages);
    case 'text':
      return extractTextSource(bytes!, maxBytes, maxPages);
  }
}
