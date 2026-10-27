import {
  SOURCE_FILE_MIME_TYPES,
  SOURCE_TEXT_MAX_BYTES,
  SOURCE_TEXT_MAX_CHARACTERS,
  resolveSourceFileType,
} from '@/lib/sources/schema';
import type { PlanLimits } from '@/lib/billing/plan-limits';

export type ClientSourceError = 'fileType' | 'fileTooLarge' | 'invalidInput';

function extensionOf(filename: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function inferSourceMimeType(file: Pick<File, 'name' | 'type'>): string | null {
  const declared = file.type.trim().toLowerCase();
  if (declared) return declared;
  const extension = extensionOf(file.name);
  if (extension === 'pdf') return SOURCE_FILE_MIME_TYPES.pdf;
  if (extension === 'epub') return SOURCE_FILE_MIME_TYPES.epub;
  return null;
}

export function sourceFileMimeType(file: Pick<File, 'name' | 'type'>): string | null {
  const mimeType = inferSourceMimeType(file);
  if (!mimeType) return null;
  return resolveSourceFileType(file.name, mimeType) ? mimeType : null;
}

export function maxSourceFileBytes(limits: PlanLimits): number {
  return limits.maxFileMb * 1024 * 1024;
}

export function validateSourceFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  limits: PlanLimits,
): ClientSourceError | null {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return 'invalidInput';
  if (!sourceFileMimeType(file)) return 'fileType';
  if (file.size > maxSourceFileBytes(limits)) return 'fileTooLarge';
  return null;
}

export function textByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function validateSourceText(value: string, limits: PlanLimits): ClientSourceError | null {
  if (value.trim().length === 0) return 'invalidInput';
  if (value.length > SOURCE_TEXT_MAX_CHARACTERS) return 'invalidInput';
  const bytes = textByteLength(value);
  if (bytes > SOURCE_TEXT_MAX_BYTES) return 'invalidInput';
  if (bytes > maxSourceFileBytes(limits)) return 'fileTooLarge';
  return null;
}

export function sourceCapacity(limits: PlanLimits): number {
  return limits.unbooksPerMonth ?? limits.unbooksFairUse;
}
