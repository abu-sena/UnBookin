import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), runTask: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: { execute: mocks.execute } }));
vi.mock('@/lib/ai/run-task', () => ({ runTask: mocks.runTask }));
import { mergeRanks, retrieveChunks } from '@/lib/mentor/retrieval';

const sourceId = '33333333-3333-4333-8333-333333333333';
const userId = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';

type SqlShape = { text: string[]; params: unknown[] };

/** Drizzle SQL nodes expose string chunks and parameter values. */
function inspect(node: unknown, out: SqlShape): void {
  if (Array.isArray(node)) {
    for (const child of node) inspect(child, out);
    return;
  }
  if (node === undefined) return;
  if (typeof node !== 'object') {
    out.params.push(node);
    return;
  }
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.queryChunks)) {
    inspect(record.queryChunks, out);
    return;
  }
  if ('encoder' in record && 'value' in record) {
    out.params.push(record.value);
    return;
  }
  if (Array.isArray(record.value)) {
    for (const value of record.value) if (typeof value === 'string') out.text.push(value);
    return;
  }
  if (typeof record.value === 'string') {
    out.text.push(record.value);
    return;
  }
  if ('value' in record) out.params.push(record.value);
}

function shape(query: unknown): { text: string; params: unknown[] } {
  const out: SqlShape = { text: [], params: [] };
  inspect(query, out);
  return { text: out.text.join(' '), params: out.params };
}

function row(id: string, idx: number, text: string) {
  return {
    id,
    idx,
    text,
    page_from: idx,
    page_to: idx + 1,
    chapter_title: `Bab ${idx}`,
  };
}

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.runTask.mockReset();
});

describe('mergeRanks', () => {
  it('fuses ranked lists with reciprocal rank fusion at k=60, ties by first appearance', () => {
    expect(
      mergeRanks([
        ['a', 'b'],
        ['b', 'c'],
      ]),
    ).toEqual(['b', 'a', 'c']);
    expect(
      mergeRanks([
        ['x', 'y'],
        ['z', 'y'],
      ]),
    ).toEqual(['y', 'x', 'z']);
    expect(mergeRanks([[], []])).toEqual([]);
  });
});

describe('retrieveChunks', () => {
  it('merges cosine and full-text rankings within the source filter', async () => {
    mocks.runTask.mockResolvedValue({ embeddings: [[0.1, 0.2]], costUsd: 0.001 });
    mocks.execute.mockImplementation(async (query: unknown) => {
      const { text } = shape(query);
      if (text.includes('<=>')) return [row('a', 1, 'alpha'), row('b', 2, 'beta')];
      if (text.includes('plainto_tsquery')) return [row('b', 2, 'beta'), row('c', 3, 'gamma')];
      return [];
    });

    const result = await retrieveChunks({ sourceId, question: 'apa itu beta?', userId });
    expect(result.mode).toBe('hybrid');
    expect(result.chunks.map((chunk) => chunk.id)).toEqual(['b', 'a', 'c']);
    expect(result.chunks[0]).toEqual({
      id: 'b',
      idx: 2,
      text: 'beta',
      pageFrom: 2,
      pageTo: 3,
      chapterTitle: 'Bab 2',
    });

    expect(mocks.execute).toHaveBeenCalledTimes(2);
    for (const [query] of mocks.execute.mock.calls) {
      const { text, params } = shape(query);
      expect(text).toContain('source_id');
      expect(params).toContain(sourceId);
    }
  });

  it('falls back to full text when embedding fails or is not configured', async () => {
    mocks.runTask.mockRejectedValue(new Error('configuration missing'));
    mocks.execute.mockResolvedValue([row('c', 3, 'gamma')]);

    const result = await retrieveChunks({ sourceId, question: 'gamma', userId });
    expect(result.mode).toBe('text');
    expect(result.chunks.map((chunk) => chunk.id)).toEqual(['c']);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(shape(mocks.execute.mock.calls[0]?.[0]).text).not.toContain('<=>');
  });

  it('treats an empty result as valid', async () => {
    mocks.runTask.mockResolvedValue({ embeddings: [[0]], costUsd: null });
    mocks.execute.mockResolvedValue([]);
    await expect(retrieveChunks({ sourceId, question: 'kosong', userId })).resolves.toEqual({
      chunks: [],
      mode: 'hybrid',
    });
  });
});
