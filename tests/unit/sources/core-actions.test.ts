import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  prepareFileSource: vi.fn(),
  createInlineSource: vi.fn(),
  finalizeSourceUpload: vi.fn(),
  cancelPending: vi.fn(),
  retryProcessing: vi.fn(),
  deleteOwned: vi.fn(),
  loadMyUploadContext: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/sources/store', () => ({
  prepareFileSource: mocks.prepareFileSource,
  createInlineSource: mocks.createInlineSource,
  markQueueFailed: vi.fn(),
}));
vi.mock('@/lib/sources/lifecycle', () => ({
  finalizeSourceUpload: mocks.finalizeSourceUpload,
  cancelSourceUpload: mocks.cancelPending,
  retrySourceProcessing: mocks.retryProcessing,
  deleteOwnedUnbook: mocks.deleteOwned,
}));
vi.mock('@/lib/sources/queries', () => ({ loadMyUploadContext: mocks.loadMyUploadContext }));

import {
  cancelSourceUpload,
  completeSourceUpload,
  createTextSource,
  createUrlSource,
  deleteMyUnbook,
  getSourceUploadContext,
  prepareSourceUpload,
  retrySourceProcessing,
} from '@/lib/sources/actions';
import { SourceError } from '@/lib/sources/errors';

const USER = { id: '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f' };
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

const fileInput = {
  title: 'Buku',
  filename: 'buku.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  interestSlug: 'produk',
  rightsConfirmed: true as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(USER);
});

describe('authentication before dependencies', () => {
  it('propagates the session redirect and never touches storage', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;/masuk;307;',
    });
    mocks.requireUser.mockRejectedValue(redirect);

    await expect(prepareSourceUpload(fileInput)).rejects.toBe(redirect);
    expect(mocks.prepareFileSource).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('strict input validation', () => {
  it('rejects a forged userId key before any store access', async () => {
    const forged = { ...fileInput, userId: USER.id } as unknown as Parameters<
      typeof prepareSourceUpload
    >[0];
    const result = await prepareSourceUpload(forged);

    expect(result).toEqual({ ok: false, error: 'invalidInput' });
    expect(mocks.prepareFileSource).not.toHaveBeenCalled();
  });

  it('returns rightsRequired when the rights checkbox is missing or false', async () => {
    const missing = { ...fileInput } as Record<string, unknown>;
    delete missing.rightsConfirmed;

    await expect(
      prepareSourceUpload(missing as unknown as Parameters<typeof prepareSourceUpload>[0]),
    ).resolves.toEqual({
      ok: false,
      error: 'rightsRequired',
    });
    await expect(
      createTextSource({
        title: 'T',
        text: 'Isi',
        interestSlug: 'produk',
        rightsConfirmed: false,
      } as unknown as Parameters<typeof createTextSource>[0]),
    ).resolves.toEqual({ ok: false, error: 'rightsRequired' });
    expect(mocks.prepareFileSource).not.toHaveBeenCalled();
    expect(mocks.createInlineSource).not.toHaveBeenCalled();
  });

  it('rejects malformed ids with invalidInput and no side effects', async () => {
    for (const run of [
      () => completeSourceUpload({ sourceId: 'nope' }),
      () => cancelSourceUpload({ sourceId: 'nope' }),
      () => retrySourceProcessing({ unbookId: 'nope' }),
      () => deleteMyUnbook({ unbookId: 'nope' }),
    ]) {
      await expect(run()).resolves.toEqual({ ok: false, error: 'invalidInput' });
    }
    expect(mocks.finalizeSourceUpload).not.toHaveBeenCalled();
    expect(mocks.cancelPending).not.toHaveBeenCalled();
    expect(mocks.retryProcessing).not.toHaveBeenCalled();
    expect(mocks.deleteOwned).not.toHaveBeenCalled();
  });
});

describe('mutation flows', () => {
  it('prepares the upload for the session identity and revalidates', async () => {
    mocks.prepareFileSource.mockResolvedValue({
      sourceId: SOURCE_ID,
      unbookId: UNBOOK_ID,
      uploadUrl: 'https://signed.example',
      mimeType: 'application/pdf',
    });

    const result = await prepareSourceUpload(fileInput);

    expect(result).toMatchObject({ ok: true, data: { unbookId: UNBOOK_ID } });
    expect(mocks.prepareFileSource).toHaveBeenCalledWith(USER.id, fileInput);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/library');
  });

  it('maps store failures to safe codes without throwing', async () => {
    mocks.prepareFileSource.mockRejectedValue(new SourceError('quotaExceeded'));

    await expect(prepareSourceUpload(fileInput)).resolves.toEqual({
      ok: false,
      error: 'quotaExceeded',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('creates a text source with the parsed content', async () => {
    mocks.createInlineSource.mockResolvedValue({ sourceId: SOURCE_ID, unbookId: UNBOOK_ID });

    const result = await createTextSource({
      title: 'Catatan',
      text: 'Teks panjang.',
      interestSlug: 'produk',
      rightsConfirmed: true,
    });

    expect(result).toEqual({ ok: true, data: { unbookId: UNBOOK_ID } });
    expect(mocks.createInlineSource).toHaveBeenCalledWith(USER.id, {
      title: 'Catatan',
      interestSlug: 'produk',
      text: 'Teks panjang.',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/library');
  });

  it('creates a URL source with the parsed URL', async () => {
    mocks.createInlineSource.mockResolvedValue({ sourceId: SOURCE_ID, unbookId: UNBOOK_ID });

    const result = await createUrlSource({
      title: 'Artikel',
      url: 'https://example.com/a',
      interestSlug: 'produk',
      rightsConfirmed: true,
    });

    expect(result).toEqual({ ok: true, data: { unbookId: UNBOOK_ID } });
    expect(mocks.createInlineSource).toHaveBeenCalledWith(USER.id, {
      title: 'Artikel',
      interestSlug: 'produk',
      url: 'https://example.com/a',
    });
  });

  it('completes, cancels, retries and delete through the session identity', async () => {
    mocks.finalizeSourceUpload.mockResolvedValue({ unbookId: UNBOOK_ID });
    mocks.cancelPending.mockResolvedValue(undefined);
    mocks.retryProcessing.mockResolvedValue(undefined);
    mocks.deleteOwned.mockResolvedValue(undefined);

    await expect(completeSourceUpload({ sourceId: SOURCE_ID })).resolves.toEqual({
      ok: true,
      data: { unbookId: UNBOOK_ID },
    });
    await expect(cancelSourceUpload({ sourceId: SOURCE_ID })).resolves.toEqual({
      ok: true,
      data: { cancelled: true },
    });
    await expect(retrySourceProcessing({ unbookId: UNBOOK_ID })).resolves.toEqual({
      ok: true,
      data: { unbookId: UNBOOK_ID },
    });
    await expect(deleteMyUnbook({ unbookId: UNBOOK_ID })).resolves.toEqual({
      ok: true,
      data: { deleted: true },
    });

    expect(mocks.finalizeSourceUpload).toHaveBeenCalledWith(USER.id, SOURCE_ID);
    expect(mocks.cancelPending).toHaveBeenCalledWith(USER.id, SOURCE_ID);
    expect(mocks.retryProcessing).toHaveBeenCalledWith(USER.id, UNBOOK_ID);
    expect(mocks.deleteOwned).toHaveBeenCalledWith(USER.id, UNBOOK_ID);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(4);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/library');
  });
});

describe('getSourceUploadContext', () => {
  it('returns the safe context for the session identity', async () => {
    const context = { interests: [{ slug: 'produk', name: 'Produk' }], allowance: {} };
    mocks.loadMyUploadContext.mockResolvedValue(context);

    const result = await getSourceUploadContext();

    expect(result).toEqual({ ok: true, data: context });
    expect(mocks.requireUser).toHaveBeenCalledWith('/library');
    expect(mocks.loadMyUploadContext).toHaveBeenCalledWith(USER.id);
  });

  it('maps configuration failures to a safe error result', async () => {
    mocks.loadMyUploadContext.mockRejectedValue(new SourceError('configurationMissing'));

    await expect(getSourceUploadContext()).resolves.toEqual({
      ok: false,
      error: 'configurationMissing',
    });
  });

  it('still propagates the redirect, never catching it', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;/masuk;307;',
    });
    mocks.requireUser.mockRejectedValue(redirect);

    await expect(getSourceUploadContext()).rejects.toBe(redirect);
  });
});
