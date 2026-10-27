import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { buildSections, pagesProcessed } from '@/lib/generation/sections';

const chunk = (idx: number, chapterTitle: string | null, text = 'text') => ({
  id: String(idx), idx, chapterTitle, pageFrom: idx + 1, pageTo: idx + 1, text,
});
describe('generation sections', () => {
  it('sorts chunks and groups only consecutive chapter titles', () => {
    const sections = buildSections([chunk(3, 'A'), chunk(1, 'A'), chunk(0, 'A'), chunk(2, 'B')]);
    expect(sections.map((s) => [s.id, s.title, s.chunkIdxFrom, s.chunkIdxTo]))
      .toEqual([['s1', 'A', 0, 1], ['s2', 'B', 2, 2], ['s3', 'A', 3, 3]]);
    expect(sections[0]).toMatchObject({ pageFrom: 1, pageTo: 2, preview: 'text\n\ntext' });
  });
  it('keeps marker boundaries private and limits previews to 600 characters', () => {
    const sections = buildSections([chunk(0, '__section:0', 'x'.repeat(800)), chunk(1, '__section:1')]);
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.title)).toEqual([null, null]);
    expect(sections[0]!.preview).toHaveLength(600);
  });
  it('caps at 60 by smallest adjacent pair, deterministically resolving ties left first', () => {
    const chunks = Array.from({ length: 62 }, (_, idx) => chunk(idx, String(idx), idx < 2 ? 'x' : 'long'));
    const first = buildSections(chunks);
    expect(first).toHaveLength(60);
    expect(first[0]).toMatchObject({ chunkIdxFrom: 0, chunkIdxTo: 2, title: null });
    expect(buildSections([...chunks].reverse())).toEqual(first);
  });
  it('supports empty input and nullable page metadata', () => {
    expect(buildSections([])).toEqual([]);
    expect(buildSections([{ ...chunk(0, null), pageFrom: null, pageTo: null }])[0])
      .toMatchObject({ title: null, pageFrom: null, pageTo: null });
  });
});
describe('pages processed', () => {
  it.each(['epub', 'url', 'text'])('rounds word equivalents up for %s', (type) => {
    expect(pagesProcessed({ type, wordCount: 601, pageCount: 99 })).toBe(3);
  });
  it('uses PDF page count', () => {
    expect(pagesProcessed({ type: 'pdf', wordCount: 900, pageCount: 17 })).toBe(17);
  });
  it('rejects invalid counts', () => {
    expect(() => pagesProcessed({ type: 'pdf', pageCount: null, wordCount: 10 }))
      .toThrow('generationInvalid');
  });
});
