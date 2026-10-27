# M3 — Source extraction and page-aware chunks (`src/lib/ingest/extract.ts`, `src/lib/ingest/chunk.ts`)

Server-side text extraction (PRD 7.1 steps 1–4) for PDF, EPUB, URL and plain-text sources, plus the
learning-chunk packer. `extract.ts` is server-only (`import 'server-only'`); `chunk.ts` is pure and
importable from any environment. Every failure is a safe `SourceError` code; vendor messages, source
text and raw URLs are never logged or propagated. All parsing is inert: HTML/XML go into a linkedom
DOM that is never rendered, scripts never execute, no resource referenced by a document is fetched,
and nothing is written to disk.

## Contracts

```ts
type ExtractedPage = {
  page: number;
  text: string;
  chapterTitle?: string;    // first heading governing the page
  chapterTitles?: string[]; // every heading that starts on a shared page, in order
};
type ExtractedSource = { pages: ExtractedPage[]; pageCount: number; wordCount: number; title?: string; author?: string };

extractSource(input: {
  type: 'pdf' | 'epub' | 'url' | 'text';
  bytes?: Uint8Array;   // pdf/epub binary; UTF-8 for `text`
  url?: string;         // `url` type
  maxPages: number;     // inclusive, validated before any AI step
  maxBytes: number;     // hard byte bound on the raw source
}): Promise<ExtractedSource>;

type SourceChunkInput = {
  idx: number;               // sequential 0..N-1
  chapterTitle: string | null;
  pageFrom: number; pageTo: number; // inclusive 1-based span inside `pages`
  text: string;              // contiguous source text apart from documented cleanup
  tokenCount: number;        // ceil(chars / 4), documented estimator
  sectionIndex?: number;     // 1-based synthetic section (chapterless sources only)
};

chunkSource(pages: ExtractedPage[]): SourceChunkInput[];
```

`pages` is never empty for a returned source; page references are 1-based and contiguous.
`title`/`author` are optional metadata; the user's own title always takes precedence later in the
pipeline. No DB/AI/billing writes happen here.

## Text model

- `normalizeSourceText`: unify newlines, drop null/control/zero-width chars, map vertical tabs and
  NBSP-class chars to spaces, collapse runs, keep paragraph breaks (`\n\n`).
- Meaningful words: CJK ideographs/kana/hangul count per character; everything else counts Unicode
  letter/digit runs. Zero meaningful words → `noText` (E2-01 AC5 for scanned PDFs).
- EPUB/URL/text page count is exactly `max(1, ceil(wordCount / 300))` (PRD 7.5). Content is packed
  into exactly that many pseudo pages in reading order. The packer uses the same meaningful-word
  units as the counter (CJK code point or Unicode letter/digit run) and balances both word and
  code-unit character counts, so there is no giant final tail, no dangling surrogate, and no
  page-count inflation for long paragraphs. A single indivisible long token still counts as one word
  (so it cannot create extra quota pages) and may exceed the average character budget; that is the
  documented character-bound exception. PDF page count is actual.
- `maxPages` is enforced **before** any AI work: PDF rejects on `numPages` before text extraction;
  EPUB/URL/text reject after the page count formula, before the source is returned.
- Chapter headings: first non-empty `h1..h6` per EPUB chapter (max 200 chars). When several chapters
  share one pseudo page, `chapterTitle` is the first governing heading and `chapterTitles` preserves
  every heading that starts there. PDF pages get outline/heading titles (below); URL/text pages have
  none and downstream code must tolerate that.

## PDF

- `%PDF-` magic required, else `fileType`.
- `getDocumentProxy(bytes, { isEvalSupported: false, maxImageSize: 16777216 })` from unpdf; text per
  page via `extractText(proxy, { mergePages: false })`; proxy loading task destroyed in `finally`
  (unpdf's build exposes `loadingTask.destroy()` / `cleanup()` — verified at runtime).
- Whole extraction bounded by a 30 s wall-clock deadline (`processingFailed` on timeout); metadata
  (`getMeta` → `info.Title`/`info.Author`) gets a 2 s budget and is optional. The loading task is
  destroyed in `finally` on every path.
- Chapter detection (PRD 7.1 step 2): the optional outline (`getOutline` → named/direct destinations
  via `getDestination`/`getPageIndex`) is resolved to validated 1-based actual pages, capped at 500
  entries, 4 nesting levels and a 3 s budget inside the main deadline. Titles are normalized and
  bounded to 200 chars; malformed, empty and out-of-range destinations are ignored. Each title is
  inherited through following pages.
- If no usable outline exists, conservative standalone `BAB` / `CHAPTER` / `Bagian` heading lines
  (number present, short, no sentence punctuation) seed the same inheritance. Pages before the first
  heading stay untitled; the first real heading is never dropped.
- No OCR, no rendering. No text at all → `noText`.

## EPUB

- ZIP signature + exact stored `mimetype` `application/epub+zip`, else `fileType`.
- `META-INF/container.xml` → OPF `rootfile` → manifest + **spine reading order** (never filename
  order). Metadata XML (container, OPF) must not contain a DOCTYPE or ENTITY (`invalidInput`);
  missing manifest/archive spine entries are `invalidInput`.
- Paths normalize inside a virtual ZIP root only: absolute paths, drive letters, schemes,
  backslashes, control chars and root-escaping `..` are rejected. Contained `..`
  (`OEBPS/../Text/ch1.xhtml`) resolves normally, so ordinary EPUB layouts are not falsely rejected.
- Only text-like entries (`.xml .xhtml .html .htm .opf .ncx .txt`, plus `mimetype`) are ever
  inflated; images/fonts/binaries are skipped without allocation. The fflate filter runs on the
  central directory before any allocation and enforces: ≤ 5000 entries (`invalidInput`), no ZIP64
  0xFFFFFFFF sentinel / unsafe sizes (`fileTooLarge`), safe unique normalized entry names
  (`invalidInput`), text entry ≤ 8 MB and inflated aggregate ≤ min(64 MB, maxBytes × 10)
  (`fileTooLarge`). Actual inflated bytes are re-counted afterwards; declared sizes are never
  trusted.
- Chapter markup: benign `<!doctype html>` and standard W3C XHTML PUBLIC declarations are stripped
  before inert parsing (an external DTD is never fetched); ENTITY, internal subsets and custom DTDs
  are rejected (`invalidInput`). Script/style/nav/head and form controls are dropped; block elements
  become paragraph spacing; entities decode via the DOM. No HTML ever leaves the module.

## URL

- Network is fully delegated to the frozen `fetchSafeUrl` (`maxBytes` bound passes through); this
  module never touches the network itself.
- `text/plain` is treated as plain text. HTML/XHTML is parsed inertly; Readability extracts the
  article (`title`, `byline` metadata optional). If no article is detected, the cleaned body text is
  used as fallback; no meaningful text at all → `noText`.

## Chunks

- Target 600–900 estimated tokens, ~80-token overlap (suffix cut at a word boundary, never empty),
  final short tail allowed; forward progress guaranteed (blocks ≤ 1200 chars → every chunk advances
  at least one block). No empty chunks, no dropped tail, sequential `idx`.
- A clear chapter boundary is never crossed just to reach the minimum: a short chapter may produce a
  short chunk, and overlap is not carried across a heading change. Within one chapter the normal
  600–900 target and overlap still apply.
- `pageFrom`/`pageTo` are the real span of the blocks in the chunk; `chapterTitle` is the first
  chapter heading among the chunk's own (non-overlap) blocks, `null` when the source has none.
- Chapterless sources receive a 1-based `sectionIndex` grouped near
  `SYNTHETIC_SECTION_TOKENS` (2500 estimated tokens). This is internal structural metadata only: no
  source words are added and `chapterTitle` stays `null` (no invented chapter name).
- Cleanup only (documented): standalone page-number lines (short, digits+punctuation only) removed
  everywhere; short (≤ 80 chars) lines repeated as the first/last non-empty line on a strict
  majority of ≥ 3 pages removed at those edges only — normal repeated body paragraphs survive.
- Token estimate is `ceil(chars / 4)` (exported as `CHARS_PER_TOKEN`); block packing joins with the
  original `\n\n` separators, so chunk text stays contiguous source text apart from cleanup. No
  source-instruction interpretation; memory use is linear in input+output size.

## Error mapping

| Situation | Code |
| --- | --- |
| Bad options (`maxPages`/`maxBytes`), missing bytes, structural EPUB violations, traversal, entry abuse | `invalidInput` |
| Bad URL input / safe-url URL policy | `invalidUrl` |
| Wrong PDF/EPUB/ZIP signature or mimetype, corrupt document shape | `fileType` |
| Source bytes over `maxBytes`, oversized entries, aggregate, ZIP64 sentinel | `fileTooLarge` |
| Page count over inclusive `maxPages` (PDF pre-extraction, others post-formula) | `pagesExceeded` |
| No meaningful letters/numbers anywhere | `noText` |
| Safe-url DNS/transport failures | `fetchFailed` |
| PDF deadline exceeded / vendor failure | `processingFailed` |

## Tests

`tests/unit/ingest/extract.test.ts` (`@vitest-environment node`) and `tests/unit/ingest/chunk.test.ts`
— no network, no services. PDFs and EPUBs are generated in-test by tiny builders (synthetic,
CC0-style content; no canvas): small/200-page PDFs, metadata PDF, synthetic nested outline,
malformed-outline heading fallback, empty scanned PDF, free-60 rejects 200 pre-extraction, pro-500
accepts 200; EPUB spine order ≠ filename order, entities, contained `../` href regression, benign
chapter doctypes, shared-page heading list, wrong mimetype/ZIP signature, traversal + absolute +
escape + duplicate entry names, metadata DOCTYPE, chapter ENTITY/custom DTD, 8 MB entry cap,
aggregate cap with image entries skipped, hand-built ZIP64 sentinel, missing spine entries, noText;
URL article/fallback/plain-text via mocked safe fetch; text normalization, Unicode/CJK counting,
10k-CJK, many one-letter words, a single 5k-char token, uneven paragraphs, exact page counts,
reading-order text preservation, page limits, invalid UTF-8. Chunk tests cover bounds, overlap
contiguity, page spans, headings/missing headings, short-chapter boundaries, synthetic sections,
overlong tokens/surrogate safety, Unicode, tail preservation, header/footer/page-number cleanup,
non-majority retention, digit-bearing sentences.

## Measurements

- 200-page synthetic PDF (this fixture): **~35 ms** extraction on the dev machine (i.e. orders of
  magnitude under the 30 s bound). The free-plan rejection of the same file returns before text
  extraction runs.

## Limitations / follow-ups

- PDF outline parsing uses the installed pdf.js proxy; a broken/absent outline falls back to
  conservative standalone headings, and a chapterless PDF has `chapterTitle: null` plus synthetic
  chunk `sectionIndex` values. It never OCRs or renders pages.
- Pseudo pages are character-balanced against the word-derived page count. If the average character
  share itself exceeds the old 4000-char soft guide (many long words) or one token is indivisible,
  the page may be longer; word-based quota/page count never changes and no text is dropped.
- Token counts are estimates (`chars/4`), not a tokenizer count; embedding time uses the same
  estimate consistently.
- EPUB chapters with non-XHTML/HTML media types in the spine are skipped; exotic compressed-image
  EPUBs still validate because images are never inflated.
- PDF text ordering follows pdf.js content order; heavily columnar layouts may interleave columns.
