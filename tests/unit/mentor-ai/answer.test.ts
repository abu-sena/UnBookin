import { describe, expect, it } from 'vitest';
import {
  answerCitationsSchema,
  createAnswerParser,
  finalizeAnswer,
  renderSegments,
  type AnswerChunk,
  type AnswerSegment,
} from '@/lib/mentor/answer';

const chunks: AnswerChunk[] = [
  { id: '11111111-1111-4111-8111-111111111111', pageFrom: 3, pageTo: 4 },
  { id: '22222222-2222-4222-8222-222222222222', pageFrom: null, pageTo: 9 },
];

function collect(text: string, byChar = false): AnswerSegment[] {
  const parser = createAnswerParser(chunks);
  const segments: AnswerSegment[] = [];
  if (byChar) {
    for (const char of text) segments.push(...parser.push(char));
  } else {
    segments.push(...parser.push(text));
  }
  segments.push(...parser.end());
  return segments;
}

function texts(segments: AnswerSegment[]): string {
  return segments
    .filter(
      (segment): segment is Extract<AnswerSegment, { type: 'text' }> => segment.type === 'text',
    )
    .map((segment) => segment.text)
    .join('');
}

describe('answer parser', () => {
  it('never leaks markers split across tokens, even one character at a time', () => {
    const input = 'Klaim[[1]] lalu umum <<luar-sumber>>catatan<</luar-sumber>> akhir.';
    for (const byChar of [false, true]) {
      const segments = collect(input, byChar);
      expect(texts(segments)).not.toContain('[[');
      expect(texts(segments)).not.toContain('<<luar');
      expect(texts(segments)).not.toContain('<</luar');
      expect(segments).toContainEqual({
        type: 'citation',
        n: 1,
        chunkId: chunks[0]!.id,
        page: 3,
      });
      expect(segments.some((segment) => segment.type === 'outside-start')).toBe(true);
      expect(segments.some((segment) => segment.type === 'outside-end')).toBe(true);
      expect(texts(segments)).toContain('catatan');
    }
  });

  it('drops unknown citation numbers without leaking the marker', () => {
    const segments = collect('A[[99]]B');
    expect(segments.filter((segment) => segment.type === 'citation')).toEqual([]);
    expect(texts(segments)).toBe('AB');
  });

  it('keeps ordinary brackets and angle pairs as text', () => {
    expect(texts(collect('lihat [1] dan a << b dan a < b'))).toBe('lihat [1] dan a << b dan a < b');
  });

  it('closes an unclosed outside block at the end', () => {
    const segments = collect('umum <<luar-sumber>>tanpa penutup');
    expect(segments.at(-1)).toEqual({ type: 'outside-end' });
    expect(texts(segments)).toBe('umum tanpa penutup');
  });
});

describe('finalizeAnswer and stored rendering', () => {
  const raw = 'Isi sumber[[1]] dan [[2]].[[1]] Umum <<luar-sumber>>tambahan<</luar-sumber>>';

  it('dedupes citations whose page falls back to pageTo', () => {
    const finalized = finalizeAnswer(raw, chunks);
    expect(finalized.citations).toEqual([
      { chunkId: chunks[0]!.id, page: 3 },
      { chunkId: chunks[1]!.id, page: 9 },
    ]);
    expect(answerCitationsSchema.parse(finalized.citations)).toEqual(finalized.citations);
    expect(finalized.content).toContain('[[1]]');
    expect(finalized.content).toContain('<<luar-sumber>>');
  });

  it('renders stored history exactly like the live segments', () => {
    const live = collect(raw);
    const finalized = finalizeAnswer(raw, chunks);
    expect(renderSegments(finalized.content, finalized.citations)).toEqual(live);
    expect(texts(live)).toBe('Isi sumber dan . Umum tambahan');
  });

  it('does not stall the stream on a stray double bracket', () => {
    const parser = createAnswerParser([]);
    const first = parser.push('lihat [[catatan ini');
    expect(first.map((segment) => (segment.type === 'text' ? segment.text : '')).join('')).toBe(
      'lihat [[catatan ini',
    );
    expect(parser.end()).toEqual([]);
  });

  it('drops a marker fragment when the answer is cut off inside it', () => {
    for (const cut of ['Isi [[', 'Isi [[1', 'Isi [[1]', 'Isi <<luar', 'Isi <</luar-sumber>']) {
      const parser = createAnswerParser([]);
      const segments = [...parser.push(cut), ...parser.end()];
      const shown = segments.map((segment) => (segment.type === 'text' ? segment.text : '')).join('');
      expect(shown).toBe('Isi ');
    }
  });
});
