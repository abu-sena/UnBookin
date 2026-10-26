// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSafeUrl: vi.fn(),
}));

vi.mock('server-only', () => ({}));

// Network is never touched: the frozen safe-url module is mocked and only its
// bounded result shape is simulated here.
vi.mock('@/lib/ingest/safe-url', () => ({ fetchSafeUrl: mocks.fetchSafeUrl }));

import { zipSync, type Zippable } from 'fflate';
import { extractSource } from '@/lib/ingest/extract';
import { SourceError, type SourceErrorCode } from '@/lib/sources/errors';

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function expectSourceError(promise: Promise<unknown>, code: SourceErrorCode): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'SourceError', code });
}

//#region synthetic PDF builder (no canvas, ASCII text only)

function escapePdfText(text: string): string {
  return text.replace(/[\\()]/g, (character) => `\\${character}`);
}

function buildPdf(pages: string[], meta?: { title?: string; author?: string }): Uint8Array {
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((text, index) => {
    const pageId = pageIds[index]!;
    const contentId = pageId + 1;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    const stream =
      text.length === 0 ? 'BT ET' : `BT /F1 12 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  const infoId = 4 + pages.length * 2;
  if (meta) {
    const title = meta.title ? ` /Title (${escapePdfText(meta.title)})` : '';
    const author = meta.author ? ` /Author (${escapePdfText(meta.author)})` : '';
    objects[infoId] = `<<${title}${author} >>`;
  }
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    if (objects[id] === undefined) continue;
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R${meta ? ` /Info ${infoId} 0 R` : ''} >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

//#endregion

//#region synthetic EPUB builder

function containerXml(opfPath: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n` +
    `<rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles>\n` +
    `</container>`
  );
}

function chapterXhtml(heading: string, paragraphs: string[]): string {
  const body = paragraphs.map((text) => `<p>${text}</p>`).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head>\n` +
    `<body><h1>${heading}</h1>${body}</body></html>`
  );
}

function buildOpf(chapters: Array<{ id: string; href: string; title: string }>): string {
  const items = chapters
    .map(
      (chapter) =>
        `<item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml"/>`,
    )
    .join('\n');
  const spine = chapters.map((chapter) => `<itemref idref="${chapter.id}"/>`).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">\n` +
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
    `<dc:title>Synthetic Learning Book</dc:title>\n` +
    `<dc:creator>Jane Doe</dc:creator>\n` +
    `</metadata>\n<manifest>\n${items}\n</manifest>\n<spine>\n${spine}\n</spine>\n</package>`
  );
}

function buildEpub(entries: Record<string, string>): Uint8Array {
  const files: Zippable = {
    mimetype: [textBytes('application/epub+zip'), { level: 0 }],
  };
  if (!Object.keys(entries).some((name) => name.endsWith('container.xml'))) {
    files['META-INF/container.xml'] = textBytes(containerXml('OEBPS/content.opf'));
  }
  for (const [name, content] of Object.entries(entries)) {
    files[name] = textBytes(content);
  }
  return zipSync(files);
}

/** Hand-built ZIP whose central directory declares the ZIP64 size sentinel. */
function buildZip64SentinelEpub(): Uint8Array {
  const name = textBytes('mimetype');
  const data = textBytes('application/epub+zip');
  const local = new Uint8Array(30 + name.length + data.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(6, 0, true);
  localView.setUint16(8, 0, true); // stored
  localView.setUint16(26, name.length, true);
  local.set(name, 30);
  local.set(data, 30 + name.length);
  const central = new Uint8Array(46 + name.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint32(20, 0xffffffff, true); // compressed size sentinel
  centralView.setUint32(24, 0xffffffff, true); // uncompressed size sentinel
  centralView.setUint16(28, name.length, true);
  central.set(name, 46);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, central.length, true);
  eocdView.setUint32(16, local.length, true);
  const total = local.length + central.length + eocd.length;
  const zip = new Uint8Array(total);
  zip.set(local, 0);
  zip.set(central, local.length);
  zip.set(eocd, local.length + central.length);
  return zip;
}

//#endregion

beforeEach(() => {
  mocks.fetchSafeUrl.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractSource: pdf', () => {
  it('extracts a small PDF page by page with 1-based references', async () => {
    const bytes = buildPdf([
      'Alpha page one content.',
      'Bravo page two content.',
      'Charlie page three content.',
    ]);
    const source = await extractSource({ type: 'pdf', bytes, maxPages: 60, maxBytes: 10_000_000 });
    expect(source.pageCount).toBe(3);
    expect(source.pages.map((page) => page.page)).toEqual([1, 2, 3]);
    expect(source.pages[0]?.text).toContain('Alpha page one');
    expect(source.pages[1]?.text).toContain('Bravo page two');
    expect(source.pages[2]?.text).toContain('Charlie page three');
    expect(source.wordCount).toBeGreaterThan(0);
  });

  it('reads optional PDF metadata title and author', async () => {
    const bytes = buildPdf(['Hello world.'], { title: 'Synthetic Title', author: 'Jane Author' });
    const source = await extractSource({ type: 'pdf', bytes, maxPages: 60, maxBytes: 10_000_000 });
    expect(source.title).toBe('Synthetic Title');
    expect(source.author).toBe('Jane Author');
  });

  it('rejects a scanned PDF without text with noText', async () => {
    const bytes = buildPdf(['']);
    await expectSourceError(
      extractSource({ type: 'pdf', bytes, maxPages: 60, maxBytes: 10_000_000 }),
      'noText',
    );
  });

  it('rejects 200 pages on the free plan before text extraction', async () => {
    const pages = Array.from({ length: 200 }, (_, index) => `Page ${index + 1} body text.`);
    const bytes = buildPdf(pages);
    const started = performance.now();
    await expectSourceError(
      extractSource({ type: 'pdf', bytes, maxPages: 60, maxBytes: 50_000_000 }),
      'pagesExceeded',
    );
    const elapsed = performance.now() - started;
    // Rejection happens on the page count check, long before extraction could.
    expect(elapsed).toBeLessThan(2000);
  });

  it('accepts 200 pages on the pro plan and reports extraction duration', async () => {
    const pages = Array.from({ length: 200 }, (_, index) => `Page ${index + 1} body text.`);
    const bytes = buildPdf(pages);
    const started = performance.now();
    const source = await extractSource({
      type: 'pdf',
      bytes,
      maxPages: 500,
      maxBytes: 50_000_000,
    });
    const durationMs = performance.now() - started;
    console.info(`[m3-extraction] 200-page PDF extraction: ${durationMs.toFixed(0)} ms`);
    expect(source.pageCount).toBe(200);
    expect(source.pages[199]?.page).toBe(200);
    expect(durationMs).toBeLessThan(30_000);
  });

  it('enforces the byte bound before parsing', async () => {
    const bytes = buildPdf(['Hello world.']);
    await expectSourceError(
      extractSource({ type: 'pdf', bytes, maxPages: 60, maxBytes: bytes.byteLength - 1 }),
      'fileTooLarge',
    );
  });

  it('rejects non-PDF bytes with fileType', async () => {
    await expectSourceError(
      extractSource({
        type: 'pdf',
        bytes: textBytes('not a pdf at all'),
        maxPages: 60,
        maxBytes: 1000,
      }),
      'fileType',
    );
  });

  it('maps a corrupted PDF body to processingFailed', async () => {
    const bytes = buildPdf(['Hello world.']);
    const truncated = bytes.slice(0, Math.floor(bytes.byteLength / 2));
    await expectSourceError(
      extractSource({ type: 'pdf', bytes: truncated, maxPages: 60, maxBytes: 10_000_000 }),
      'processingFailed',
    );
  });

  it('validates bounds on input', async () => {
    const bytes = buildPdf(['Hello world.']);
    await expectSourceError(
      extractSource({ type: 'pdf', bytes, maxPages: 0, maxBytes: 1000 }),
      'invalidInput',
    );
    await expectSourceError(
      extractSource({ type: 'pdf', bytes, maxPages: 60, maxBytes: 0 }),
      'invalidInput',
    );
    await expectSourceError(
      extractSource({ type: 'pdf', bytes: undefined, maxPages: 60, maxBytes: 1000 }),
      'invalidInput',
    );
  });
});

describe('extractSource: epub', () => {
  const chapterFiles = {
    'OEBPS/content.opf': buildOpf([
      { id: 'c3', href: 'Text/charlie.xhtml', title: 'Charlie Chapter' },
      { id: 'c1', href: 'Text/alpha.xhtml', title: 'Alpha Chapter' },
      { id: 'c2', href: 'Text/bravo.xhtml', title: 'Bravo Chapter' },
    ]),
    'OEBPS/Text/charlie.xhtml': chapterXhtml('Charlie Heading', [
      'Charlie first paragraph body text.',
    ]),
    'OEBPS/Text/alpha.xhtml': chapterXhtml('Alpha Heading', [
      'Alpha paragraph with caf&eacute; &amp; cr&egrave;me &lt;tags&gt;.',
    ]),
    'OEBPS/Text/bravo.xhtml': chapterXhtml('Bravo Heading', ['Bravo paragraph body text.']),
  };

  it('follows spine reading order, not filename order, and decodes entities', async () => {
    const bytes = buildEpub(chapterFiles);
    const source = await extractSource({ type: 'epub', bytes, maxPages: 60, maxBytes: 10_000_000 });
    expect(source.title).toBe('Synthetic Learning Book');
    expect(source.author).toBe('Jane Doe');
    // The whole tiny book fits one pseudo page; reading order is the spine's.
    const allText = source.pages.map((page) => page.text).join('\n\n');
    const charlie = allText.indexOf('Charlie Heading');
    const alpha = allText.indexOf('Alpha Heading');
    const bravo = allText.indexOf('Bravo Heading');
    expect(charlie).toBeGreaterThan(-1);
    expect(charlie).toBeLessThan(alpha);
    expect(alpha).toBeLessThan(bravo);
    expect(source.pages[0]?.chapterTitle).toBe('Charlie Heading');
    expect(allText).toContain('café & crème <tags>');
  });

  it('accepts a contained relative href that stays inside the ZIP root', async () => {
    const bytes = buildEpub({
      'OEBPS/content.opf': buildOpf([
        { id: 'n1', href: '../Shared/notes.xhtml', title: 'Notes Chapter' },
      ]),
      'Shared/notes.xhtml': chapterXhtml('Notes Heading', ['Shared notes body text.']),
    });
    const source = await extractSource({ type: 'epub', bytes, maxPages: 60, maxBytes: 10_000_000 });
    expect(source.pages[0]?.chapterTitle).toBe('Notes Heading');
    expect(source.pages[0]?.text).toContain('Shared notes body');
  });

  it('accepts a benign html5 doctype on chapters', async () => {
    const markup =
      '<!doctype html>\n<html><head><title>t</title></head><body><h1>Modern Chapter</h1><p>Modern body text.</p></body></html>';
    const bytes = buildEpub({
      'OEBPS/content.opf': buildOpf([{ id: 'm1', href: 'modern.xhtml', title: 'Modern' }]),
      'OEBPS/modern.xhtml': markup,
    });
    const source = await extractSource({ type: 'epub', bytes, maxPages: 60, maxBytes: 10_000_000 });
    expect(source.pages[0]?.chapterTitle).toBe('Modern Chapter');
    expect(source.pages[0]?.text).toContain('Modern body text.');
  });

  it('rejects a wrong mimetype and invalid ZIP signatures with fileType', async () => {
    const badMime = buildEpub(chapterFiles);
    const patched = new Uint8Array(badMime);
    // Flip a byte inside the stored mimetype payload.
    const marker = textBytes('application/epub+zip');
    const index = patched.indexOf(marker[0]!, marker.length > 0 ? 34 : 0);
    patched[index] = 0x58; // corrupts 'a' -> 'X' inside the stored entry
    await expectSourceError(
      extractSource({ type: 'epub', bytes: patched, maxPages: 60, maxBytes: 10_000_000 }),
      'fileType',
    );
    await expectSourceError(
      extractSource({
        type: 'epub',
        bytes: textBytes('definitely not a zip'),
        maxPages: 60,
        maxBytes: 1000,
      }),
      'fileType',
    );
  });

  it('rejects root-escaping hrefs and unsafe archive entry names', async () => {
    const escapeHref = buildEpub({
      'OEBPS/content.opf': buildOpf([{ id: 'e1', href: '../../escape.xhtml', title: 'Escape' }]),
      'escape.xhtml': chapterXhtml('Escape', ['body']),
    });
    await expectSourceError(
      extractSource({ type: 'epub', bytes: escapeHref, maxPages: 60, maxBytes: 10_000_000 }),
      'invalidInput',
    );
    const absoluteEntry: Zippable = {
      mimetype: [textBytes('application/epub+zip'), { level: 0 }],
      '/abs/path.xhtml': textBytes('<html><body><p>body text.</p></body></html>'),
    };
    await expectSourceError(
      extractSource({
        type: 'epub',
        bytes: zipSync(absoluteEntry),
        maxPages: 60,
        maxBytes: 10_000_000,
      }),
      'invalidInput',
    );
    const escapeEntry: Zippable = {
      mimetype: [textBytes('application/epub+zip'), { level: 0 }],
      '../escape.xhtml': textBytes('<html><body><p>body text.</p></body></html>'),
    };
    await expectSourceError(
      extractSource({
        type: 'epub',
        bytes: zipSync(escapeEntry),
        maxPages: 60,
        maxBytes: 10_000_000,
      }),
      'invalidInput',
    );
  });

  it('rejects duplicate normalized entry names', async () => {
    const files: Zippable = {
      mimetype: [textBytes('application/epub+zip'), { level: 0 }],
      'a/doc.xhtml': textBytes('<html><body><p>one.</p></body></html>'),
      'a//doc.xhtml': textBytes('<html><body><p>two.</p></body></html>'),
    };
    await expectSourceError(
      extractSource({ type: 'epub', bytes: zipSync(files), maxPages: 60, maxBytes: 10_000_000 }),
      'invalidInput',
    );
  });

  it('rejects a DOCTYPE in metadata XML and ENTITY/custom DTD in chapters', async () => {
    const doctypeContainer = buildEpub({
      ...chapterFiles,
      'META-INF/container.xml': `<!DOCTYPE container [<!ENTITY x "y">]>\n${containerXml('OEBPS/content.opf')}`,
    });
    await expectSourceError(
      extractSource({ type: 'epub', bytes: doctypeContainer, maxPages: 60, maxBytes: 10_000_000 }),
      'invalidInput',
    );
    const entityChapter =
      '<!DOCTYPE html [ <!ENTITY trick "payload"> ]>\n<html><body><h1>T</h1><p>&trick;</p></body></html>';
    const entityEpub = buildEpub({
      'OEBPS/content.opf': buildOpf([{ id: 'x1', href: 'x.xhtml', title: 'X' }]),
      'OEBPS/x.xhtml': entityChapter,
    });
    await expectSourceError(
      extractSource({ type: 'epub', bytes: entityEpub, maxPages: 60, maxBytes: 10_000_000 }),
      'invalidInput',
    );
    const customDtd =
      '<!DOCTYPE html SYSTEM "http://evil.example/custom.dtd">\n<html><body><h1>T</h1><p>body.</p></body></html>';
    const customEpub = buildEpub({
      'OEBPS/content.opf': buildOpf([{ id: 'x2', href: 'c.xhtml', title: 'C' }]),
      'OEBPS/c.xhtml': customDtd,
    });
    await expectSourceError(
      extractSource({ type: 'epub', bytes: customEpub, maxPages: 60, maxBytes: 10_000_000 }),
      'invalidInput',
    );
  });

  it('rejects missing spine entries (manifest or archive)', async () => {
    const missingManifest = buildEpub({
      'OEBPS/content.opf': buildOpf([{ id: 'ghost', href: 'ghost.xhtml', title: 'Ghost' }]),
    });
    await expectSourceError(
      extractSource({ type: 'epub', bytes: missingManifest, maxPages: 60, maxBytes: 10_000_000 }),
      'invalidInput',
    );
    const missingFile = buildEpub({
      'OEBPS/content.opf': buildOpf([{ id: 'r1', href: 'real.xhtml', title: 'Real' }]),
      'OEBPS/other.xhtml': chapterXhtml('Other', ['body']),
    });
    await expectSourceError(
      extractSource({ type: 'epub', bytes: missingFile, maxPages: 60, maxBytes: 10_000_000 }),
      'invalidInput',
    );
  });

  it('rejects oversized text entries before allocation', async () => {
    const bigText = `word ${'a'.repeat(9 * 1024 * 1024)}`;
    const bytes = buildEpub({
      'OEBPS/content.opf': buildOpf([{ id: 'b1', href: 'big.xhtml', title: 'Big' }]),
      'OEBPS/big.xhtml': `<html><body><h1>Big</h1><p>${bigText}</p></body></html>`,
    });
    expect(bytes.byteLength).toBeLessThan(10_000_000);
    await expectSourceError(
      extractSource({ type: 'epub', bytes, maxPages: 60, maxBytes: 100_000_000 }),
      'fileTooLarge',
    );
  });

  it('rejects an inflated aggregate above min(64MB, maxBytes*10)', async () => {
    const chapter = chapterXhtml('Heading', ['Body paragraph text. '.repeat(300)]);
    const bytes = buildEpub({
      'OEBPS/content.opf': buildOpf([
        { id: 'p1', href: 'one.xhtml', title: 'One' },
        { id: 'p2', href: 'two.xhtml', title: 'Two' },
      ]),
      'OEBPS/one.xhtml': chapter,
      'OEBPS/two.xhtml': chapter,
    });
    // The archive itself fits maxBytes; its inflated text exceeds maxBytes*10.
    expect(bytes.byteLength).toBeLessThan(2000);
    await expectSourceError(
      extractSource({ type: 'epub', bytes, maxPages: 60, maxBytes: 1300 }),
      'fileTooLarge',
    );
  });

  it('never inflates image entries even under a tiny aggregate budget', async () => {
    const image = new Uint8Array(512 * 1024).fill(0x89);
    const files: Zippable = {
      mimetype: [textBytes('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': textBytes(containerXml('OEBPS/content.opf')),
      'OEBPS/content.opf': textBytes(
        buildOpf([{ id: 'i1', href: 'page.xhtml', title: 'Image Chapter' }]),
      ),
      'OEBPS/page.xhtml': textBytes(chapterXhtml('Image Heading', ['Tiny body text.'])),
      'OEBPS/images/cover.png': image,
    };
    const bytes = zipSync(files);
    const source = await extractSource({ type: 'epub', bytes, maxPages: 60, maxBytes: 2000 });
    expect(source.pages[0]?.text).toContain('Tiny body text.');
  });

  it('rejects the ZIP64 size sentinel', async () => {
    await expectSourceError(
      extractSource({
        type: 'epub',
        bytes: buildZip64SentinelEpub(),
        maxPages: 60,
        maxBytes: 10_000_000,
      }),
      'fileTooLarge',
    );
  });

  it('rejects an all-empty EPUB with noText', async () => {
    const bytes = buildEpub({
      'OEBPS/content.opf': buildOpf([{ id: 'z1', href: 'z.xhtml', title: 'Z' }]),
      'OEBPS/z.xhtml': '<html><body><h1></h1><p>   </p></body></html>',
    });
    await expectSourceError(
      extractSource({ type: 'epub', bytes, maxPages: 60, maxBytes: 10_000_000 }),
      'noText',
    );
  });
});

describe('extractSource: url', () => {
  it('extracts a cleaned HTML article with metadata and pseudo pages', async () => {
    const body = Array.from({ length: 700 }, (_, index) => `word${index % 50}`).join(' ');
    const html =
      '<html><head><title>Article Page</title></head><body>' +
      `<article><h1>Article Title</h1><p>${body}</p></article>` +
      '<nav>ignored navigation</nav></body></html>';
    mocks.fetchSafeUrl.mockResolvedValue({
      bytes: textBytes(html),
      contentType: 'text/html',
      url: 'https://example.com/article',
    });
    const source = await extractSource({
      type: 'url',
      url: 'https://example.com/article',
      maxPages: 60,
      maxBytes: 1_000_000,
    });
    expect(mocks.fetchSafeUrl).toHaveBeenCalledWith('https://example.com/article', {
      maxBytes: 1_000_000,
    });
    expect(source.wordCount).toBeGreaterThan(600);
    expect(source.pageCount).toBe(Math.max(1, Math.ceil(source.wordCount / 300)));
    expect(source.pages.map((page) => page.page)).toEqual(
      Array.from({ length: source.pageCount }, (_, index) => index + 1),
    );
    expect(source.title).toBeTruthy();
    expect(source.pages[0]?.chapterTitle).toBeUndefined();
    expect(source.pages[0]?.text).not.toContain('ignored navigation');
  });

  it('falls back to cleaned body text when no article is detected', async () => {
    const html = '<html><body><p>Only a single short note here.</p></body></html>';
    mocks.fetchSafeUrl.mockResolvedValue({
      bytes: textBytes(html),
      contentType: 'text/html',
      url: 'https://example.com/note',
    });
    const source = await extractSource({
      type: 'url',
      url: 'https://example.com/note',
      maxPages: 60,
      maxBytes: 1_000_000,
    });
    expect(source.pages[0]?.text).toContain('Only a single short note');
  });

  it('treats text/plain responses as plain text', async () => {
    mocks.fetchSafeUrl.mockResolvedValue({
      bytes: textBytes('Plain article body with real words.'),
      contentType: 'text/plain',
      url: 'https://example.com/plain.txt',
    });
    const source = await extractSource({
      type: 'url',
      url: 'https://example.com/plain.txt',
      maxPages: 60,
      maxBytes: 1_000_000,
    });
    expect(source.pages[0]?.text).toContain('Plain article body');
  });

  it('propagates safe fetch errors unchanged', async () => {
    mocks.fetchSafeUrl.mockImplementation(() => {
      throw new SourceError('fetchFailed');
    });
    await expectSourceError(
      extractSource({ type: 'url', url: 'https://example.com/down', maxPages: 60, maxBytes: 1000 }),
      'fetchFailed',
    );
    mocks.fetchSafeUrl.mockImplementation(() => {
      throw new SourceError('fileTooLarge');
    });
    await expectSourceError(
      extractSource({ type: 'url', url: 'https://example.com/big', maxPages: 60, maxBytes: 1000 }),
      'fileTooLarge',
    );
  });

  it('rejects an HTML body without meaningful text with noText', async () => {
    mocks.fetchSafeUrl.mockResolvedValue({
      bytes: textBytes('<html><body><p>!!! ... ---</p></body></html>'),
      contentType: 'text/html',
      url: 'https://example.com/empty',
    });
    await expectSourceError(
      extractSource({
        type: 'url',
        url: 'https://example.com/empty',
        maxPages: 60,
        maxBytes: 1000,
      }),
      'noText',
    );
  });

  it('rejects a missing url with invalidUrl', async () => {
    await expectSourceError(
      extractSource({ type: 'url', url: '', maxPages: 60, maxBytes: 1000 }),
      'invalidUrl',
    );
  });
});

describe('extractSource: text', () => {
  it('normalizes control characters while preserving paragraphs', async () => {
    const raw =
      'First\u0000 para\u0007graph one.\n\nSecond paragraph\u000bhere.\r\n\r\nThird paragraph.';
    const source = await extractSource({
      type: 'text',
      bytes: textBytes(raw),
      maxPages: 60,
      maxBytes: 100_000,
    });
    const text = source.pages.map((page) => page.text).join('\n\n');
    expect(text).toContain('First paragraph one.');
    expect(text).toContain('Second paragraph here.');
    expect(text).toContain('Third paragraph.');
    expect(text).toMatch(/paragraph one\.\n\nSecond paragraph/);
    expect(text).not.toMatch(/[\u0000-\u0008\u000b]/);
  });

  it('counts unicode words including CJK characters', async () => {
    const source = await extractSource({
      type: 'text',
      bytes: textBytes('你好世界 再见 你 good words here'),
      maxPages: 60,
      maxBytes: 100_000,
    });
    // CJK counts per character (7), latin words are letter runs (3).
    expect(source.wordCount).toBe(10);
    expect(source.pageCount).toBe(1);
  });

  it('creates bounded pseudo pages for a long text', async () => {
    const body = Array.from({ length: 1000 }, (_, index) => `lexeme${index % 37}`).join(' ');
    const source = await extractSource({
      type: 'text',
      bytes: textBytes(body),
      maxPages: 60,
      maxBytes: 100_000,
    });
    expect(source.pageCount).toBe(Math.max(1, Math.ceil(source.wordCount / 300)));
    expect(source.pages).toHaveLength(source.pageCount);
    for (const page of source.pages) {
      expect(page.text.length).toBeLessThan(5000);
    }
    expect(source.pages[0]?.text).toContain('lexeme0');
  });

  it('rejects sources above the inclusive page limit', async () => {
    const body = Array.from({ length: 700 }, (_, index) => `word${index % 50}`).join(' ');
    await expectSourceError(
      extractSource({ type: 'text', bytes: textBytes(body), maxPages: 2, maxBytes: 100_000 }),
      'pagesExceeded',
    );
  });

  it('rejects empty or symbol-only text with noText', async () => {
    await expectSourceError(
      extractSource({ type: 'text', bytes: textBytes('   \n\n  '), maxPages: 60, maxBytes: 1000 }),
      'noText',
    );
    await expectSourceError(
      extractSource({
        type: 'text',
        bytes: textBytes('*** --- === !!!'),
        maxPages: 60,
        maxBytes: 1000,
      }),
      'noText',
    );
  });

  it('rejects invalid UTF-8 bytes with invalidInput', async () => {
    await expectSourceError(
      extractSource({
        type: 'text',
        bytes: new Uint8Array([0xff, 0xfe, 0x41]),
        maxPages: 60,
        maxBytes: 1000,
      }),
      'invalidInput',
    );
  });

  it('enforces the byte bound', async () => {
    const bytes = textBytes('Hello world with real words.');
    await expectSourceError(
      extractSource({ type: 'text', bytes, maxPages: 60, maxBytes: bytes.byteLength - 1 }),
      'fileTooLarge',
    );
  });
});
