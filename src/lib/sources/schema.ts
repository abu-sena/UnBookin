import { z } from 'zod';

/** Shared, client-safe limits for upload forms and Server Actions. */
export const SOURCE_TITLE_MAX = 220;
export const SOURCE_INTEREST_SLUG_MAX = 100;
export const SOURCE_FILENAME_MAX = 255;
export const SOURCE_URL_MAX = 2048;
/**
 * Kept well below the 1 MB Server Action body limit. The byte check below also
 * protects against multi-byte text inflating the request past the character cap.
 */
export const SOURCE_TEXT_MAX_CHARACTERS = 300_000;
export const SOURCE_TEXT_MAX_BYTES = 900_000;

export const SOURCE_FILE_MIME_TYPES = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
} as const;

export type SourceFileType = keyof typeof SOURCE_FILE_MIME_TYPES;

export const sourceTypeSchema = z.enum(['pdf', 'epub', 'url', 'text']);
export const sourceFileTypeSchema = z.enum(['pdf', 'epub']);

const controlCharacters = /[\u0000-\u001f\u007f]/;
const pathSeparators = /[\\/]/;

export const sourceTitleFieldSchema = z.string().trim().min(1).max(SOURCE_TITLE_MAX);
export const sourceInterestSlugFieldSchema = z.string().trim().min(1).max(SOURCE_INTEREST_SLUG_MAX);
export const sourceRightsConfirmedFieldSchema = z.literal(true);
export const sourceIdSchema = z.uuid();
export const unbookIdSchema = z.uuid();

export const sourceFilenameFieldSchema = z
  .string()
  .trim()
  .min(1)
  .max(SOURCE_FILENAME_MAX)
  .refine((value) => !pathSeparators.test(value), 'Use a file name without a path')
  .refine((value) => !controlCharacters.test(value), 'Invalid file name');

export const sourceMimeTypeFieldSchema = z.string().trim().min(1).max(100);
export const sourceSizeBytesFieldSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

function extensionOf(filename: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

/** Resolve the source type only when the extension and MIME type agree. */
export function resolveSourceFileType(filename: string, mimeType: string): SourceFileType | null {
  const extension = extensionOf(filename);
  const normalisedMime = mimeType.trim().toLowerCase();
  if (extension !== 'pdf' && extension !== 'epub') return null;
  return normalisedMime === SOURCE_FILE_MIME_TYPES[extension] ? extension : null;
}

export const sourceFileUploadSchema = z
  .strictObject({
    title: sourceTitleFieldSchema,
    filename: sourceFilenameFieldSchema,
    mimeType: sourceMimeTypeFieldSchema,
    sizeBytes: sourceSizeBytesFieldSchema,
    interestSlug: sourceInterestSlugFieldSchema,
    rightsConfirmed: sourceRightsConfirmedFieldSchema,
  })
  .superRefine((value, context) => {
    const extension = extensionOf(value.filename);
    if (extension !== 'pdf' && extension !== 'epub') {
      context.addIssue({
        code: 'custom',
        path: ['filename'],
        message: 'Only PDF and EPUB files are supported',
      });
      return;
    }
    if (value.mimeType.trim().toLowerCase() !== SOURCE_FILE_MIME_TYPES[extension]) {
      context.addIssue({
        code: 'custom',
        path: ['mimeType'],
        message: 'The file extension and MIME type must agree',
      });
    }
  });

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export const sourceTextFieldSchema = z
  .string()
  .min(1)
  .max(SOURCE_TEXT_MAX_CHARACTERS)
  .refine((value) => value.trim().length > 0, 'Text is required')
  .refine((value) => utf8ByteLength(value) <= SOURCE_TEXT_MAX_BYTES, 'Text is too large to submit');

export const sourceTextInputSchema = z.strictObject({
  title: sourceTitleFieldSchema,
  text: sourceTextFieldSchema,
  interestSlug: sourceInterestSlugFieldSchema,
  rightsConfirmed: sourceRightsConfirmedFieldSchema,
});

export const sourceUrlFieldSchema = z
  .string()
  .trim()
  .min(1)
  .max(SOURCE_URL_MAX)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        url.hostname.length > 0 &&
        url.username === '' &&
        url.password === ''
      );
    } catch {
      return false;
    }
  }, 'Enter a valid http or https URL without credentials');

export const sourceUrlInputSchema = z.strictObject({
  title: sourceTitleFieldSchema,
  url: sourceUrlFieldSchema,
  interestSlug: sourceInterestSlugFieldSchema,
  rightsConfirmed: sourceRightsConfirmedFieldSchema,
});

export const sourceIdInputSchema = z.strictObject({ sourceId: sourceIdSchema });
export const unbookIdInputSchema = z.strictObject({ unbookId: unbookIdSchema });

export type SourceFileUploadInput = z.infer<typeof sourceFileUploadSchema>;
export type SourceTextInput = z.infer<typeof sourceTextInputSchema>;
export type SourceUrlInput = z.infer<typeof sourceUrlInputSchema>;
export type SourceIdInput = z.infer<typeof sourceIdInputSchema>;
export type UnbookIdInput = z.infer<typeof unbookIdInputSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;
