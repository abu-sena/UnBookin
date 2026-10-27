import { describe, expect, it, vi } from 'vitest';
import {
  inferSourceMimeType,
  sourceFileMimeType,
  validateSourceFile,
  validateSourceText,
} from '@/components/sources/upload-limits';
import { putSourceFile } from '@/components/sources/upload-transport';
import { SOURCE_FILE_MIME_TYPES } from '@/lib/sources/schema';

const limits = {
  unbooksPerMonth: 8,
  unbooksFairUse: 40,
  maxPagesPerSource: 400,
  maxFileMb: 25,
  mentorMessagesPerMonth: null,
  originalsAccess: 'sample' as const,
  modelTier: 'economy' as const,
};

class FakeRequest {
  status = 200;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  abort = vi.fn();

  progress(loaded: number, total = 100) {
    this.upload.onprogress?.({
      lengthComputable: true,
      loaded,
      total,
    } as ProgressEvent);
  }

  finish(status = 200) {
    this.status = status;
    this.onload?.();
  }
}

function mountTransport() {
  const request = new FakeRequest();
  const onProgress = vi.fn();
  const file = new File(['%PDF-1.4'], 'buku.pdf', { type: 'application/pdf' });
  const controller = new AbortController();
  const promise = putSourceFile({
    url: 'https://storage.test/upload',
    file,
    mimeType: 'application/pdf',
    onProgress,
    signal: controller.signal,
    createRequest: () => request as unknown as XMLHttpRequest,
  });
  return { request, onProgress, file, controller, promise };
}

describe('putSourceFile', () => {
  it('PUTs the file with the signed content type and progress', async () => {
    const { request, onProgress, file, promise } = mountTransport();

    expect(request.open).toHaveBeenCalledWith('PUT', 'https://storage.test/upload', true);
    expect(request.setRequestHeader).toHaveBeenCalledTimes(1);
    expect(request.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(request.setRequestHeader).not.toHaveBeenCalledWith('Content-Length', expect.anything());
    expect(request.send).toHaveBeenCalledWith(file);

    request.progress(40);
    request.finish(204);

    await expect(promise).resolves.toBeUndefined();
    expect(onProgress).toHaveBeenNthCalledWith(1, 40);
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('rejects non-2xx responses', async () => {
    const { request, promise } = mountTransport();
    request.finish(500);

    await expect(promise).rejects.toThrow('uploadFailed');
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    const createRequest = vi.fn();
    controller.abort();

    await expect(
      putSourceFile({
        url: 'https://storage.test/upload',
        file: new File(['x'], 'buku.pdf', { type: 'application/pdf' }),
        mimeType: 'application/pdf',
        onProgress: vi.fn(),
        signal: controller.signal,
        createRequest,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('aborts the request when the signal fires mid-upload', async () => {
    const { request, controller, promise } = mountTransport();
    controller.abort();

    expect(request.abort).toHaveBeenCalledTimes(1);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('client source limits', () => {
  it('infers PDF/EPUB MIME types from the extension when the browser omits them', () => {
    expect(inferSourceMimeType({ name: 'buku.pdf', type: '' })).toBe(SOURCE_FILE_MIME_TYPES.pdf);
    expect(inferSourceMimeType({ name: 'buku.epub', type: '' })).toBe(SOURCE_FILE_MIME_TYPES.epub);
    expect(sourceFileMimeType({ name: 'buku.txt', type: 'text/plain' })).toBeNull();
  });

  it('rejects wrong types, oversized files, and empty files', () => {
    expect(validateSourceFile({ name: 'buku.txt', type: 'text/plain', size: 10 }, limits)).toBe(
      'fileType',
    );
    expect(
      validateSourceFile(
        { name: 'buku.pdf', type: 'application/pdf', size: 26 * 1024 * 1024 },
        limits,
      ),
    ).toBe('fileTooLarge');
    expect(validateSourceFile({ name: 'buku.pdf', type: 'application/pdf', size: 0 }, limits)).toBe(
      'invalidInput',
    );
    expect(
      validateSourceFile({ name: 'buku.pdf', type: 'application/pdf', size: 1024 }, limits),
    ).toBeNull();
  });

  it('rejects blank text but accepts normal pasted text', () => {
    expect(validateSourceText('   ', limits)).toBe('invalidInput');
    expect(validateSourceText('Ringkasan bacaan.', limits)).toBeNull();
  });
});
