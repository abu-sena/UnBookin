import { z } from 'zod';
import { SourceError } from '@/lib/sources/errors';

export const SOURCE_OBJECT_TYPES = ['pdf', 'epub', 'text'] as const;
export type SourceObjectType = (typeof SOURCE_OBJECT_TYPES)[number];

const EXTENSIONS: Record<SourceObjectType, string> = {
  pdf: 'pdf',
  epub: 'epub',
  text: 'txt',
};

const SOURCE_KEY_PATTERN =
  /^sources\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/source\.(pdf|epub|txt)$/i;

function isUuid(value: string): boolean {
  return z.uuid().safeParse(value).success;
}

/**
 * Build the only key shape this app is allowed to sign. Both ids are UUIDs, so
 * dots, slashes and `..` can never appear in the user/source segment.
 */
export function createSourceObjectKey(
  userId: string,
  sourceId: string,
  type: SourceObjectType,
): string {
  if (!isUuid(userId) || !isUuid(sourceId)) {
    throw new SourceError('invalidInput');
  }
  if (!(SOURCE_OBJECT_TYPES as readonly string[]).includes(type)) {
    throw new SourceError('invalidInput');
  }
  return `sources/${userId}/${sourceId}/source.${EXTENSIONS[type]}`;
}

/** Exact ownership check; a traversal or lookalike key is never accepted. */
export function isOwnedSourceObjectKey(key: string, userId: string, sourceId: string): boolean {
  if (!isUuid(userId) || !isUuid(sourceId)) return false;
  return (['pdf', 'epub', 'text'] as const).some(
    (type) => key === createSourceObjectKey(userId, sourceId, type),
  );
}

export type ParsedSourceObjectKey = {
  userId: string;
  sourceId: string;
  type: SourceObjectType;
};

/** Validate a key read back from the database before signing or reading it. */
export function parseSourceObjectKey(key: string): ParsedSourceObjectKey {
  const match = SOURCE_KEY_PATTERN.exec(key);
  if (!match) throw new SourceError('invalidInput');

  const [, userId, sourceId, extension] = match;
  if (!userId || !sourceId || !isUuid(userId) || !isUuid(sourceId)) {
    throw new SourceError('invalidInput');
  }

  const type: SourceObjectType =
    extension === 'pdf' ? 'pdf' : extension === 'epub' ? 'epub' : 'text';

  // Reject lookalike keys (e.g. uppercase or trailing characters) that the
  // case-insensitive shape check above would otherwise let through.
  const canonical = `sources/${userId}/${sourceId}/source.${EXTENSIONS[type]}`;
  if (key !== canonical) throw new SourceError('invalidInput');

  return { userId, sourceId, type };
}
