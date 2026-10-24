import messages from '@/messages/id.json';
import { describe, expect, it } from 'vitest';

/**
 * Collects the paths of every leaf that is not a non-empty string.
 * Objects are traversed; anything else (including nested arrays) counts as a
 * violation because every UI message must be a string in `messages/id.json`.
 */
function collectInvalidLeaves(node: unknown, path: string): string[] {
  if (typeof node === 'string') {
    return node.trim().length > 0 ? [] : [path];
  }

  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) =>
      collectInvalidLeaves(value, path === '' ? key : `${path}.${key}`),
    );
  }

  return [path];
}

describe('messages/id.json', () => {
  it('every leaf is a non-empty string', () => {
    expect(collectInvalidLeaves(messages, '')).toEqual([]);
  });
});
