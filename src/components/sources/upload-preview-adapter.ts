import type { SourceActionResult, SourceUploadContext } from '@/lib/sources/types';
import type { SourceUploadAdapter } from './source-action-adapter';

const PREVIEW_CONTEXT: SourceUploadContext = {
  interests: [
    { slug: 'leadership-management', name: 'Kepemimpinan dan Manajemen' },
    { slug: 'personal-development-productivity', name: 'Pengembangan Diri dan Produktivitas' },
    { slug: 'islamic-studies', name: 'Studi Islam' },
  ],
  allowance: {
    planCode: 'pro_monthly',
    limits: {
      unbooksPerMonth: 8,
      unbooksFairUse: 20,
      maxPagesPerSource: 400,
      maxFileMb: 25,
      mentorMessagesPerMonth: 300,
      originalsAccess: 'full',
      modelTier: 'main',
    },
    period: '2026-10',
    unbooksUsed: 2,
    unbooksPending: 0,
    remaining: 6,
  },
};

function success<T>(data: T): SourceActionResult<T> {
  return { ok: true, data };
}

function previewId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPreviewSourceUploadAdapter(): SourceUploadAdapter {
  return {
    getContext: async () => success(PREVIEW_CONTEXT),
    prepareFileUpload: async (input) =>
      success({
        sourceId: previewId('preview-source'),
        unbookId: previewId('preview-unbook'),
        uploadUrl: `preview://upload/${encodeURIComponent(input.filename)}`,
        mimeType: input.mimeType,
      }),
    uploadFile: ({ onProgress, signal }) =>
      new Promise<void>((resolve, reject) => {
        const steps = [20, 55, 85, 100];
        let step = 0;
        const timer = setInterval(() => {
          const value = steps[step] ?? 100;
          step += 1;
          onProgress(value);
          if (value === 100) {
            clearInterval(timer);
            resolve();
          }
        }, 120);
        signal.addEventListener(
          'abort',
          () => {
            clearInterval(timer);
            const error = new Error('Upload cancelled');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      }),
    completeFileUpload: async () => success({ unbookId: previewId('preview-unbook') }),
    cancelFileUpload: async () => success({ cancelled: true }),
    createTextSource: async () => success({ unbookId: previewId('preview-unbook') }),
    createUrlSource: async () => success({ unbookId: previewId('preview-unbook') }),
  };
}
