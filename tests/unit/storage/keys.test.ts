import { describe, expect, it, vi } from 'vitest';
import { createSourceObjectKey, isOwnedSourceObjectKey, parseSourceObjectKey } from '@/lib/storage';

vi.mock('server-only', () => ({}));

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const OTHER_USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function thrownCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe('source object keys', () => {
  it('generates the approved key for each source object type', () => {
    expect(createSourceObjectKey(USER_ID, SOURCE_ID, 'pdf')).toBe(
      `sources/${USER_ID}/${SOURCE_ID}/source.pdf`,
    );
    expect(createSourceObjectKey(USER_ID, SOURCE_ID, 'epub')).toBe(
      `sources/${USER_ID}/${SOURCE_ID}/source.epub`,
    );
    expect(createSourceObjectKey(USER_ID, SOURCE_ID, 'text')).toBe(
      `sources/${USER_ID}/${SOURCE_ID}/source.txt`,
    );
  });

  it('rejects non-UUID ids and unknown types', () => {
    expect(thrownCode(() => createSourceObjectKey('../user', SOURCE_ID, 'pdf'))).toBe(
      'invalidInput',
    );
    expect(thrownCode(() => createSourceObjectKey(USER_ID, SOURCE_ID, 'exe' as never))).toBe(
      'invalidInput',
    );
  });

  it('accepts only an exact owner/source/type key', () => {
    const key = createSourceObjectKey(USER_ID, SOURCE_ID, 'pdf');
    expect(isOwnedSourceObjectKey(key, USER_ID, SOURCE_ID)).toBe(true);
    expect(isOwnedSourceObjectKey(key, OTHER_USER_ID, SOURCE_ID)).toBe(false);
    expect(
      isOwnedSourceObjectKey(`sources/${USER_ID}/${SOURCE_ID}/source.exe`, USER_ID, SOURCE_ID),
    ).toBe(false);
    expect(
      isOwnedSourceObjectKey(`sources/${USER_ID}/../${SOURCE_ID}/source.pdf`, USER_ID, SOURCE_ID),
    ).toBe(false);
  });

  it('parses a stored key back into its ownership and type', () => {
    expect(parseSourceObjectKey(`sources/${USER_ID}/${SOURCE_ID}/source.txt`)).toEqual({
      userId: USER_ID,
      sourceId: SOURCE_ID,
      type: 'text',
    });
  });

  it('rejects traversal and malformed stored keys', () => {
    for (const key of [
      `sources/${USER_ID}/../source.pdf`,
      `sources/${USER_ID}/${SOURCE_ID}/../source.pdf`,
      `sources/${USER_ID}/${SOURCE_ID}/source.pdf.exe`,
      `/sources/${USER_ID}/${SOURCE_ID}/source.pdf`,
      'evil/key',
    ]) {
      expect(thrownCode(() => parseSourceObjectKey(key))).toBe('invalidInput');
    }
  });
});
