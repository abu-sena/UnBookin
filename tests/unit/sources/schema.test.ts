import { describe, expect, it } from 'vitest';
import {
  SOURCE_TEXT_MAX_CHARACTERS,
  sourceFileUploadSchema,
  sourceIdInputSchema,
  sourceTextInputSchema,
  sourceUrlInputSchema,
  unbookIdInputSchema,
} from '@/lib/sources/schema';

const SOURCE_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';

const fileInput = {
  title: '  Atomic Habits  ',
  filename: 'atomic-habits.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  interestSlug: 'personal-development-productivity',
  rightsConfirmed: true,
};

const textInput = {
  title: 'Belajar fokus',
  text: 'Satu ide utama dari bacaan ini.',
  interestSlug: 'personal-development-productivity',
  rightsConfirmed: true,
};

const urlInput = {
  title: 'Artikel fokus',
  url: 'https://example.com/artikel',
  interestSlug: 'personal-development-productivity',
  rightsConfirmed: true,
};

describe('source input schemas', () => {
  it('requires the rights checkbox to be literal true for every source kind', () => {
    for (const schema of [sourceFileUploadSchema, sourceTextInputSchema, sourceUrlInputSchema]) {
      const input =
        schema === sourceFileUploadSchema
          ? fileInput
          : schema === sourceTextInputSchema
            ? textInput
            : urlInput;
      expect(schema.safeParse({ ...input, rightsConfirmed: false }).success).toBe(false);
      expect(schema.safeParse({ ...input, rightsConfirmed: undefined }).success).toBe(false);
    }
  });

  it('trims titles and file names, and coerces a numeric byte size', () => {
    const result = sourceFileUploadSchema.safeParse({
      ...fileInput,
      sizeBytes: '2048',
      filename: '  atomic-habits.pdf ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Atomic Habits');
      expect(result.data.filename).toBe('atomic-habits.pdf');
      expect(result.data.sizeBytes).toBe(2048);
    }
  });

  it('accepts only PDF/EPUB pairs where extension and MIME agree', () => {
    expect(
      sourceFileUploadSchema.safeParse({
        ...fileInput,
        filename: 'book.epub',
        mimeType: 'application/epub+zip',
      }).success,
    ).toBe(true);
    expect(
      sourceFileUploadSchema.safeParse({ ...fileInput, mimeType: 'application/epub+zip' }).success,
    ).toBe(false);
    expect(sourceFileUploadSchema.safeParse({ ...fileInput, filename: 'book.txt' }).success).toBe(
      false,
    );
    expect(
      sourceFileUploadSchema.safeParse({
        ...fileInput,
        filename: 'book.exe',
        mimeType: 'text/plain',
      }).success,
    ).toBe(false);
  });

  it('rejects paths and control characters in file names', () => {
    expect(
      sourceFileUploadSchema.safeParse({ ...fileInput, filename: '../book.pdf' }).success,
    ).toBe(false);
    expect(
      sourceFileUploadSchema.safeParse({ ...fileInput, filename: 'folder\\book.pdf' }).success,
    ).toBe(false);
    expect(
      sourceFileUploadSchema.safeParse({ ...fileInput, filename: 'book\u0000.pdf' }).success,
    ).toBe(false);
  });

  it('rejects non-positive or fractional byte sizes', () => {
    for (const sizeBytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(sourceFileUploadSchema.safeParse({ ...fileInput, sizeBytes }).success).toBe(false);
    }
  });

  it('bounds the title, interest slug, file name and pasted text', () => {
    expect(sourceFileUploadSchema.safeParse({ ...fileInput, title: 'x'.repeat(221) }).success).toBe(
      false,
    );
    expect(
      sourceFileUploadSchema.safeParse({ ...fileInput, interestSlug: 'x'.repeat(101) }).success,
    ).toBe(false);
    expect(
      sourceFileUploadSchema.safeParse({ ...fileInput, filename: `${'x'.repeat(256)}.pdf` })
        .success,
    ).toBe(false);
    expect(
      sourceTextInputSchema.safeParse({
        ...textInput,
        text: 'x'.repeat(SOURCE_TEXT_MAX_CHARACTERS + 1),
      }).success,
    ).toBe(false);
  });

  it('accepts text at the character cap and rejects whitespace-only text', () => {
    expect(
      sourceTextInputSchema.safeParse({
        ...textInput,
        text: 'x'.repeat(SOURCE_TEXT_MAX_CHARACTERS),
      }).success,
    ).toBe(true);
    expect(sourceTextInputSchema.safeParse({ ...textInput, text: '   \n\t ' }).success).toBe(false);
  });

  it('allows http/https URLs without credentials only', () => {
    expect(sourceUrlInputSchema.safeParse({ ...urlInput, url: 'http://example.com' }).success).toBe(
      true,
    );
    for (const url of [
      'ftp://example.com/book',
      'javascript:alert(1)',
      'https://user:pass@example.com/book',
      'https://user@example.com/book',
      'not a url',
      'https://',
    ]) {
      expect(sourceUrlInputSchema.safeParse({ ...urlInput, url }).success).toBe(false);
    }
  });

  it('validates UUID source and Unbook references', () => {
    expect(sourceIdInputSchema.safeParse({ sourceId: SOURCE_ID }).success).toBe(true);
    expect(unbookIdInputSchema.safeParse({ unbookId: SOURCE_ID }).success).toBe(true);
    expect(sourceIdInputSchema.safeParse({ sourceId: '../../etc/passwd' }).success).toBe(false);
    expect(unbookIdInputSchema.safeParse({ unbookId: 'not-a-uuid' }).success).toBe(false);
  });

  it('never accepts a client-supplied user id', () => {
    for (const input of [fileInput, textInput, urlInput]) {
      const schema =
        input === fileInput
          ? sourceFileUploadSchema
          : input === textInput
            ? sourceTextInputSchema
            : sourceUrlInputSchema;
      const result = schema.safeParse({ ...input, userId: SOURCE_ID });
      expect(result.success).toBe(false);
    }
  });
});
