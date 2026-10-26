import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real SDK and presigner are used here on purpose: global SDK mocks hide
// wire-level regressions such as an empty-body checksum baked into the
// signature. Presigning is pure computation, so no network call ever happens.
vi.mock('server-only', () => ({}));

import { createSourceUploadUrl } from '@/lib/storage';

const USER_ID = '0d5c1f2e-8a4b-4d3c-9e6f-7a8b9c0d1e2f';
const SOURCE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const FILE_KEY = `sources/${USER_ID}/${SOURCE_ID}/source.pdf`;

beforeEach(() => {
  // Fake local endpoint and credentials: signing works offline, and a real
  // request is never attempted by createSourceUploadUrl.
  vi.stubEnv('S3_ENDPOINT', 'http://127.0.0.1:9000');
  vi.stubEnv('S3_REGION', 'auto');
  vi.stubEnv('S3_BUCKET', 'test-bucket');
  vi.stubEnv('S3_ACCESS_KEY_ID', 'presign-test-access-key');
  vi.stubEnv('S3_SECRET_ACCESS_KEY', 'presign-test-secret-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createSourceUploadUrl (real SDK presigner)', () => {
  it('signs a five-minute PUT with content type and length and no empty-body checksum', async () => {
    const result = await createSourceUploadUrl({
      userId: USER_ID,
      sourceId: SOURCE_ID,
      type: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 86310,
    });

    expect(result.fileKey).toBe(FILE_KEY);
    expect(result.expiresIn).toBe(300);

    const url = new URL(result.uploadUrl);
    expect(url.protocol).toBe('http:');
    expect(url.host).toBe('127.0.0.1:9000');

    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');

    const signedHeaders = (url.searchParams.get('X-Amz-SignedHeaders') ?? '')
      .split(';')
      .map((header) => header.toLowerCase());
    expect(signedHeaders).toContain('content-type');
    expect(signedHeaders).toContain('content-length');

    // The default WHEN_SUPPORTED checksum would sign the digest of the empty
    // bytes the server sees (x-amz-checksum-crc32=AAAAAA==), which a real
    // bucket rejects with BadDigest once the browser uploads a nonempty body.
    const checksumParams = [...url.searchParams.keys()].filter(
      (key) => key.startsWith('x-amz-checksum') || key === 'x-amz-sdk-checksum-algorithm',
    );
    expect(checksumParams).toEqual([]);
  });
});
