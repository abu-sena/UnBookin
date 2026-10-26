import 'server-only';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SourceError, toSourceErrorCode } from '@/lib/sources/errors';
import { createSourceObjectKey, parseSourceObjectKey, type SourceObjectType } from './keys';

export const SOURCE_UPLOAD_URL_TTL_SECONDS = 300;
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type StorageClient = {
  client: S3Client;
  bucket: string;
};

let cachedClient: S3Client | null = null;
let cachedClientIdentity: string | null = null;
let cachedBucket: string | null = null;

/** Read configuration lazily so an unconfigured build/import still succeeds. */
function readStorageConfig(): StorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const region = process.env.S3_REGION?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

function getStorageClient(): StorageClient {
  const config = readStorageConfig();
  if (!config) throw new SourceError('storageUnavailable');

  const identity = `${config.endpoint}\u0000${config.region}\u0000${config.accessKeyId}`;
  if (!cachedClient || cachedClientIdentity !== identity) {
    cachedClient = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Presigned browser PUTs carry no body here, so the SDK default
      // (WHEN_SUPPORTED) would sign a checksum of empty bytes and a real
      // bucket would reject the nonempty upload with BadDigest. R2 is
      // compatible with WHEN_REQUIRED, which only signs checksums when the
      // request actually requires one.
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
    cachedClientIdentity = identity;
    cachedBucket = config.bucket;
  }

  return { client: cachedClient, bucket: cachedBucket ?? config.bucket };
}

function storageError(error: unknown): SourceError {
  return error instanceof SourceError ? error : new SourceError(toSourceErrorCode(error));
}

type UploadInput = {
  userId: string;
  sourceId: string;
  type: Extract<SourceObjectType, 'pdf' | 'epub'>;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Create a short-lived, upload-only signed URL. No download URL is ever exposed
 * to a client, and callers must authorize ownership first.
 */
export async function createSourceUploadUrl(
  input: UploadInput,
): Promise<{ fileKey: string; uploadUrl: string; expiresIn: number }> {
  const { userId, sourceId, type, sizeBytes } = input;
  if (type !== 'pdf' && type !== 'epub') throw new SourceError('invalidInput');
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new SourceError('invalidInput');
  }

  const expectedMime = type === 'pdf' ? 'application/pdf' : 'application/epub+zip';
  if (input.mimeType.trim().toLowerCase() !== expectedMime) {
    throw new SourceError('fileType');
  }

  const fileKey = createSourceObjectKey(userId, sourceId, type);
  const storage = getStorageClient();

  try {
    const command = new PutObjectCommand({
      Bucket: storage.bucket,
      Key: fileKey,
      ContentType: expectedMime,
      ContentLength: sizeBytes,
    });
    const uploadUrl = await getSignedUrl(storage.client, command, {
      expiresIn: SOURCE_UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return { fileKey, uploadUrl, expiresIn: SOURCE_UPLOAD_URL_TTL_SECONDS };
  } catch (error) {
    throw storageError(error);
  }
}

export async function headSourceObject(
  fileKey: string,
): Promise<{ sizeBytes: number; mimeType: string }> {
  parseSourceObjectKey(fileKey);
  const storage = getStorageClient();

  try {
    const result = await storage.client.send(
      new HeadObjectCommand({ Bucket: storage.bucket, Key: fileKey }),
    );
    const sizeBytes = Number(result.ContentLength);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      throw new SourceError('notFound');
    }
    return {
      sizeBytes,
      mimeType: result.ContentType?.trim() || 'application/octet-stream',
    };
  } catch (error) {
    throw storageError(error);
  }
}

type AsyncChunkSource = AsyncIterable<unknown>;

function asyncChunks(body: unknown): AsyncChunkSource | null {
  if (typeof body !== 'object' || body === null) return null;
  if (Symbol.asyncIterator in body) {
    return body as AsyncChunkSource;
  }
  const transform = (body as { transformToWebStream?: unknown }).transformToWebStream;
  if (typeof transform === 'function') {
    const stream = (transform as () => ReadableStream<Uint8Array>).call(body);
    return stream as unknown as AsyncChunkSource;
  }
  return null;
}

function toBytes(chunk: unknown): Uint8Array {
  if (typeof chunk === 'string') return new TextEncoder().encode(chunk);
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  throw new SourceError('processingFailed');
}

function destroyBody(body: unknown): void {
  if (typeof body !== 'object' || body === null) return;
  const destroy = (body as { destroy?: unknown }).destroy;
  if (typeof destroy === 'function') {
    try {
      (destroy as () => void).call(body);
    } catch {
      // Best effort only; the safe error is thrown by the caller.
    }
  }
}

/**
 * Read at most `maxBytes`. The declared Content-Length is only a hint: the byte
 * count is enforced on the stream too, and the request is aborted when exceeded.
 */
export async function readSourceObject(fileKey: string, maxBytes: number): Promise<Uint8Array> {
  parseSourceObjectKey(fileKey);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new SourceError('invalidInput');
  }

  const storage = getStorageClient();
  const controller = new AbortController();

  try {
    const result = await storage.client.send(
      new GetObjectCommand({ Bucket: storage.bucket, Key: fileKey }),
      { abortSignal: controller.signal },
    );

    const body: unknown = result.Body;
    if (body === null || body === undefined) throw new SourceError('notFound');

    const declaredLength = Number(result.ContentLength);
    if (Number.isSafeInteger(declaredLength) && declaredLength > maxBytes) {
      controller.abort();
      destroyBody(body);
      throw new SourceError('fileTooLarge');
    }

    const source = asyncChunks(body);
    if (!source) throw new SourceError('processingFailed');

    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of source) {
      const bytes = toBytes(chunk);
      if (total + bytes.byteLength > maxBytes) {
        controller.abort();
        destroyBody(body);
        throw new SourceError('fileTooLarge');
      }
      chunks.push(bytes);
      total += bytes.byteLength;
    }

    const resultBytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      resultBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return resultBytes;
  } catch (error) {
    controller.abort();
    throw storageError(error);
  }
}

export async function putSourceText(fileKey: string, text: string): Promise<void> {
  const parsed = parseSourceObjectKey(fileKey);
  if (parsed.type !== 'text') throw new SourceError('invalidInput');

  const storage = getStorageClient();
  const body = new TextEncoder().encode(text);

  try {
    await storage.client.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: fileKey,
        Body: body,
        ContentType: TEXT_CONTENT_TYPE,
        ContentLength: body.byteLength,
      }),
    );
  } catch (error) {
    throw storageError(error);
  }
}

/** Deleting an object that is already absent is a success. */
export async function deleteSourceObject(fileKey: string): Promise<void> {
  parseSourceObjectKey(fileKey);
  const storage = getStorageClient();

  try {
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: fileKey }));
  } catch (error) {
    const safe = storageError(error);
    if (safe.code === 'notFound') return;
    throw safe;
  }
}
