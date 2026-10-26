import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  signedUrl: vi.fn(),
  commands: [] as Array<{ kind: string; input: Record<string, unknown> }>,
  clientOptions: [] as unknown[],
}));

vi.mock('server-only', () => ({}));

vi.mock('@aws-sdk/client-s3', () => {
  class MockCommand {
    readonly input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  class PutObjectCommand extends MockCommand {
    constructor(input: Record<string, unknown>) {
      super(input);
      mocks.commands.push({ kind: 'PutObject', input });
    }
  }
  class HeadObjectCommand extends MockCommand {
    constructor(input: Record<string, unknown>) {
      super(input);
      mocks.commands.push({ kind: 'HeadObject', input });
    }
  }
  class GetObjectCommand extends MockCommand {
    constructor(input: Record<string, unknown>) {
      super(input);
      mocks.commands.push({ kind: 'GetObject', input });
    }
  }
  class DeleteObjectCommand extends MockCommand {
    constructor(input: Record<string, unknown>) {
      super(input);
      mocks.commands.push({ kind: 'DeleteObject', input });
    }
  }
  class S3Client {
    constructor(options: unknown) {
      mocks.clientOptions.push(options);
    }
    send(...args: unknown[]) {
      return mocks.send(...args);
    }
  }
  return {
    S3Client,
    PutObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.signedUrl }));

import {
  createSourceUploadUrl,
  deleteSourceObject,
  headSourceObject,
  putSourceText,
  readSourceObject,
  SOURCE_UPLOAD_URL_TTL_SECONDS,
} from '@/lib/storage';
import { createSourceObjectKey } from '@/lib/storage/keys';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const PDF_KEY = createSourceObjectKey(USER_ID, SOURCE_ID, 'pdf');
const TEXT_KEY = createSourceObjectKey(USER_ID, SOURCE_ID, 'text');

function firstCommand() {
  const command = mocks.commands[0];
  if (!command) throw new Error('Expected a command');
  return command;
}

function notFoundError() {
  return Object.assign(new Error('missing'), {
    name: 'NoSuchKey',
    $metadata: { httpStatusCode: 404 },
  });
}

function streamBody(chunks: Uint8Array[]) {
  return {
    destroy: vi.fn(),
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

beforeEach(() => {
  vi.stubEnv('S3_ENDPOINT', 'https://r2.example.com');
  vi.stubEnv('S3_REGION', 'auto');
  vi.stubEnv('S3_BUCKET', 'test-bucket');
  vi.stubEnv('S3_ACCESS_KEY_ID', 'test-access-key');
  vi.stubEnv('S3_SECRET_ACCESS_KEY', 'test-secret-key');
  mocks.send.mockReset();
  mocks.signedUrl.mockReset();
  mocks.commands.length = 0;
  mocks.clientOptions.length = 0;
  mocks.signedUrl.mockResolvedValue('https://r2.example.com/signed-upload');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createSourceUploadUrl', () => {
  it('signs a five-minute upload with the exact key, MIME type and byte size', async () => {
    const result = await createSourceUploadUrl({
      userId: USER_ID,
      sourceId: SOURCE_ID,
      type: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });

    expect(result).toEqual({
      fileKey: PDF_KEY,
      uploadUrl: 'https://r2.example.com/signed-upload',
      expiresIn: 300,
    });
    expect(SOURCE_UPLOAD_URL_TTL_SECONDS).toBe(300);

    expect(mocks.clientOptions[0]).toMatchObject({
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });

    const command = firstCommand();
    expect(command.kind).toBe('PutObject');
    expect(command.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: PDF_KEY,
      ContentType: 'application/pdf',
      ContentLength: 1024,
    });

    const call = mocks.signedUrl.mock.calls[0];
    if (!call) throw new Error('Expected getSignedUrl');
    expect(call[2]).toEqual({
      expiresIn: 300,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  });

  it('rejects a MIME type that does not match the file type', async () => {
    await expect(
      createSourceUploadUrl({
        userId: USER_ID,
        sourceId: SOURCE_ID,
        type: 'pdf',
        mimeType: 'application/epub+zip',
        sizeBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'fileType' });
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });
});

describe('headSourceObject', () => {
  it('returns the declared size and MIME type', async () => {
    mocks.send.mockResolvedValueOnce({
      ContentLength: 2048,
      ContentType: 'application/pdf',
    });

    await expect(headSourceObject(PDF_KEY)).resolves.toEqual({
      sizeBytes: 2048,
      mimeType: 'application/pdf',
    });
    expect(firstCommand()).toMatchObject({
      kind: 'HeadObject',
      input: { Bucket: 'test-bucket', Key: PDF_KEY },
    });
  });

  it('maps a missing object to notFound', async () => {
    mocks.send.mockRejectedValueOnce(notFoundError());
    await expect(headSourceObject(PDF_KEY)).rejects.toMatchObject({ code: 'notFound' });
  });
});

describe('readSourceObject', () => {
  it('returns the bytes when the stream stays within the bound', async () => {
    mocks.send.mockResolvedValueOnce({
      ContentLength: 6,
      Body: streamBody([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5, 6])]),
    });

    await expect(readSourceObject(PDF_KEY, 6)).resolves.toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  it('stops before reading when the declared size exceeds the bound', async () => {
    const body = streamBody([new Uint8Array([1, 2, 3])]);
    mocks.send.mockResolvedValueOnce({ ContentLength: 500, Body: body });

    await expect(readSourceObject(PDF_KEY, 100)).rejects.toMatchObject({
      code: 'fileTooLarge',
    });

    const sendCall = mocks.send.mock.calls[0];
    if (!sendCall) throw new Error('Expected send');
    const options = sendCall[1] as { abortSignal?: AbortSignal };
    expect(options.abortSignal?.aborted).toBe(true);
    expect(body.destroy).toHaveBeenCalled();
  });

  it('enforces the bound again when Content-Length lies', async () => {
    const body = streamBody([
      new Uint8Array(60).fill(1),
      new Uint8Array(60).fill(2),
      new Uint8Array(60).fill(3),
    ]);
    mocks.send.mockResolvedValueOnce({ ContentLength: 10, Body: body });

    await expect(readSourceObject(PDF_KEY, 100)).rejects.toMatchObject({
      code: 'fileTooLarge',
    });
    expect(body.destroy).toHaveBeenCalled();
  });
});

describe('putSourceText', () => {
  it('stores UTF-8 text with a text content type', async () => {
    mocks.send.mockResolvedValueOnce({});

    await putSourceText(TEXT_KEY, 'Halo dunia');

    const command = firstCommand();
    expect(command.kind).toBe('PutObject');
    expect(command.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: TEXT_KEY,
      ContentType: 'text/plain; charset=utf-8',
      ContentLength: 10,
    });
    expect(new TextDecoder().decode(command.input.Body as Uint8Array)).toBe('Halo dunia');
  });

  it('refuses to overwrite a binary source key with text', async () => {
    await expect(putSourceText(PDF_KEY, 'not a pdf')).rejects.toMatchObject({
      code: 'invalidInput',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('deleteSourceObject', () => {
  it('treats an already absent object as success', async () => {
    mocks.send.mockRejectedValueOnce(notFoundError());
    await expect(deleteSourceObject(PDF_KEY)).resolves.toBeUndefined();
  });

  it('sanitises vendor failures', async () => {
    mocks.send.mockRejectedValueOnce(
      Object.assign(new Error('AccessDenied: secret-token-should-not-leak'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      }),
    );

    await expect(deleteSourceObject(PDF_KEY)).rejects.toMatchObject({
      code: 'storageUnavailable',
      message: 'storageUnavailable',
    });
  });
});

describe('key safety and configuration', () => {
  it('never signs or reads an arbitrary key', async () => {
    for (const call of [
      () => headSourceObject('evil/key'),
      () => readSourceObject('evil/key', 10),
      () => putSourceText('evil/key', 'x'),
      () => deleteSourceObject('evil/key'),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'invalidInput' });
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('imports without credentials and fails only when storage is used', async () => {
    vi.stubEnv('S3_ENDPOINT', undefined);
    vi.stubEnv('S3_ACCESS_KEY_ID', undefined);
    vi.resetModules();
    const storageModule = await import('@/lib/storage');

    await expect(storageModule.putSourceText(TEXT_KEY, 'x')).rejects.toMatchObject({
      code: 'storageUnavailable',
    });
  });
});
