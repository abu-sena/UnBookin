import 'server-only';
import { SourceError } from '@/lib/sources/errors';

export type GenerationChunk = {
  id: string; idx: number; chapterTitle: string | null;
  pageFrom: number | null; pageTo: number | null; text: string;
};
export type GenerationSection = {
  id: string; title: string | null; pageFrom: number | null; pageTo: number | null;
  chunkIdxFrom: number; chunkIdxTo: number; preview: string;
};

/** Merge the lightest adjacent pair; ties favor the earlier pair. */
export function buildSections(chunks: GenerationChunk[]): GenerationSection[] {
  const groups: { marker: string | null; chunks: GenerationChunk[]; size: number }[] = [];
  for (const chunk of [...chunks].sort((a, b) => a.idx - b.idx)) {
    const previous = groups.at(-1);
    if (previous && previous.marker === chunk.chapterTitle) {
      previous.chunks.push(chunk);
      previous.size += chunk.text.length;
    } else groups.push({ marker: chunk.chapterTitle, chunks: [chunk], size: chunk.text.length });
  }
  while (groups.length > 60) {
    let smallest = 0;
    for (let index = 1; index < groups.length - 1; index += 1) {
      if (groups[index]!.size + groups[index + 1]!.size <
          groups[smallest]!.size + groups[smallest + 1]!.size) smallest = index;
    }
    const left = groups[smallest]!;
    const right = groups[smallest + 1]!;
    left.chunks.push(...right.chunks);
    left.size += right.size;
    if (left.marker !== right.marker) left.marker = null;
    groups.splice(smallest + 1, 1);
  }
  return groups.map((group, index) => {
    const from = group.chunks.flatMap((chunk) => chunk.pageFrom === null ? [] : [chunk.pageFrom]);
    const to = group.chunks.flatMap((chunk) => chunk.pageTo === null ? [] : [chunk.pageTo]);
    return {
      id: `s${index + 1}`,
      title: group.marker?.startsWith('__section:') ? null : group.marker,
      pageFrom: from.length ? Math.min(...from) : null,
      pageTo: to.length ? Math.max(...to) : null,
      chunkIdxFrom: group.chunks[0]!.idx,
      chunkIdxTo: group.chunks.at(-1)!.idx,
      preview: group.chunks.map((chunk) => chunk.text).join('\n\n').slice(0, 600),
    };
  });
}

export function pagesProcessed(source: {
  type: string; pageCount: number | null; wordCount: number | null;
}): number {
  const value = source.type === 'pdf' ? source.pageCount : source.wordCount;
  if (value === null || !Number.isSafeInteger(value) || value < 0) {
    throw new SourceError('generationInvalid');
  }
  return source.type === 'pdf' ? value : Math.ceil(value / 300);
}
