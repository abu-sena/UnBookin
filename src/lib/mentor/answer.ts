import { z } from 'zod';

/**
 * Answer protocol shared by the stream parser and stored history rendering.
 *
 * The model cites supplied chunks with `[[n]]` (1-based chunk order) and marks
 * general knowledge with `<<luar-sumber>>…<</luar-sumber>>`. Markers may be
 * split across stream tokens, so every partial marker is held back until it
 * resolves; raw markers never reach the user.
 */

export interface AnswerChunk {
  id: string;
  pageFrom: number | null;
  pageTo: number | null;
}

export type AnswerSegment =
  | { type: 'text'; text: string }
  | { type: 'citation'; n: number; chunkId: string; page: number | null }
  | { type: 'outside-start' }
  | { type: 'outside-end' };

export type AnswerCitation = { chunkId: string; page: number | null };

export const answerCitationsSchema = z.array(
  z.object({ chunkId: z.string().min(1), page: z.number().int().nullable() }),
);

const OUTSIDE_START = '<<luar-sumber>>';
const OUTSIDE_END = '<</luar-sumber>>';

type ScanEvent =
  | { type: 'text'; text: string }
  | { type: 'citation'; n: number }
  | { type: 'outside-start' }
  | { type: 'outside-end' };

/** Incremental scanner that keeps unresolved marker prefixes in its buffer. */
class MarkerScanner {
  private buffer = '';
  private outsideOpen = false;

  push(text: string): ScanEvent[] {
    this.buffer += text;
    return this.scan(false);
  }

  end(): ScanEvent[] {
    const events = this.scan(true);
    if (this.outsideOpen) {
      this.outsideOpen = false;
      events.push({ type: 'outside-end' });
    }
    this.flushText(events);
    return events;
  }

  private flushText(events: ScanEvent[]): void {
    if (!this.buffer) return;
    events.push({ type: 'text', text: this.buffer });
    this.buffer = '';
  }

  private scan(final: boolean): ScanEvent[] {
    const events: ScanEvent[] = [];
    let text = '';
    const flush = () => {
      if (text) {
        events.push({ type: 'text', text });
        text = '';
      }
    };
    let i = 0;
    while (i < this.buffer.length) {
      const char = this.buffer[i];
      if (char === '[') {
        if (this.buffer.startsWith('[[', i)) {
          const close = this.buffer.indexOf(']]', i + 2);
          if (close === -1) {
            // Hold only what can still become a citation, so stray "[[" never stalls the stream.
            if (!final && /^\d{0,9}\]?$/.test(this.buffer.slice(i + 2))) break;
            text += '[[';
            i += 2;
            continue;
          }
          const inner = this.buffer.slice(i + 2, close);
          if (/^\d{1,9}$/.test(inner)) {
            flush();
            events.push({ type: 'citation', n: Number(inner) });
          } else {
            text += this.buffer.slice(i, close + 2);
          }
          i = close + 2;
          continue;
        }
        if (!final && i === this.buffer.length - 1) break;
        text += '[';
        i += 1;
        continue;
      }
      if (char === '<') {
        if (this.buffer.startsWith('<<', i)) {
          if (this.buffer.startsWith(OUTSIDE_START, i)) {
            flush();
            if (!this.outsideOpen) {
              this.outsideOpen = true;
              events.push({ type: 'outside-start' });
            }
            i += OUTSIDE_START.length;
            continue;
          }
          if (this.buffer.startsWith(OUTSIDE_END, i)) {
            flush();
            if (this.outsideOpen) {
              this.outsideOpen = false;
              events.push({ type: 'outside-end' });
            }
            i += OUTSIDE_END.length;
            continue;
          }
          const rest = this.buffer.slice(i);
          const couldBeMarker = OUTSIDE_START.startsWith(rest) || OUTSIDE_END.startsWith(rest);
          if (couldBeMarker) {
            if (!final) break;
            text += rest;
            i = this.buffer.length;
            continue;
          }
          text += '<<';
          i += 2;
          continue;
        }
        if (!final && i === this.buffer.length - 1) break;
        text += '<';
        i += 1;
        continue;
      }
      text += char;
      i += 1;
    }
    flush();
    // Drop everything consumed; keep only the unresolved tail when not final.
    this.buffer = this.buffer.slice(i);
    return events;
  }
}

function pageOf(chunk: AnswerChunk): number | null {
  return chunk.pageFrom ?? chunk.pageTo ?? null;
}

/** Adjacent text segments are merged so stored rendering matches live output. */
function mergeText(segments: AnswerSegment[]): AnswerSegment[] {
  const merged: AnswerSegment[] = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    if (segment.type === 'text' && previous?.type === 'text') {
      previous.text += segment.text;
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

export interface AnswerParser {
  push(text: string): AnswerSegment[];
  end(): AnswerSegment[];
}

/** Map `[[n]]` to the supplied chunks (1-based) and drop unknown numbers. */
export function createAnswerParser(chunks: readonly AnswerChunk[]): AnswerParser {
  const scanner = new MarkerScanner();
  const map = (events: ScanEvent[]): AnswerSegment[] =>
    mergeText(
      events.flatMap((event): AnswerSegment[] => {
        if (event.type !== 'citation') return [event];
        const chunk = chunks[event.n - 1];
        if (!chunk) return [];
        return [{ type: 'citation', n: event.n, chunkId: chunk.id, page: pageOf(chunk) }];
      }),
    );
  return {
    push: (text) => map(scanner.push(text)),
    end: () => map(scanner.end()),
  };
}

/** Serialize segments back to the stored marker protocol (unknowns dropped). */
function serialize(segments: readonly AnswerSegment[]): string {
  return segments
    .map((segment) => {
      switch (segment.type) {
        case 'text':
          return segment.text;
        case 'citation':
          return `[[${segment.n}]]`;
        case 'outside-start':
          return OUTSIDE_START;
        case 'outside-end':
          return OUTSIDE_END;
      }
    })
    .join('');
}

export interface FinalizedAnswer {
  content: string;
  citations: AnswerCitation[];
}

/** Validate, dedupe citations and keep a marker protocol copy for storage. */
export function finalizeAnswer(raw: string, chunks: readonly AnswerChunk[]): FinalizedAnswer {
  const parser = createAnswerParser(chunks);
  const segments = [...parser.push(raw), ...parser.end()];
  const seen = new Set<string>();
  const citations: AnswerCitation[] = [];
  for (const segment of segments) {
    if (segment.type !== 'citation' || seen.has(segment.chunkId)) continue;
    seen.add(segment.chunkId);
    citations.push({ chunkId: segment.chunkId, page: segment.page });
  }
  return { content: serialize(segments), citations: answerCitationsSchema.parse(citations) };
}

/**
 * Render stored history with the same segments as the live stream. Citation
 * markers map to the deduped citation list in first-appearance order, which is
 * exactly how `finalizeAnswer` produces it.
 */
export function renderSegments(
  content: string,
  citations: readonly AnswerCitation[],
): AnswerSegment[] {
  const scanner = new MarkerScanner();
  const order = new Map<number, number>();
  const map = (events: ScanEvent[]): AnswerSegment[] =>
    mergeText(
      events.flatMap((event): AnswerSegment[] => {
        if (event.type !== 'citation') return [event];
        if (!order.has(event.n)) order.set(event.n, order.size);
        const citation = citations[order.get(event.n) ?? -1];
        if (!citation) return [];
        return [{ type: 'citation', n: event.n, chunkId: citation.chunkId, page: citation.page }];
      }),
    );
  return map([...scanner.push(content), ...scanner.end()]);
}
