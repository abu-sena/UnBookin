import { describe, expect, it } from 'vitest';
import { buildEmbeddingTaskConfigRow, resolveEmbeddingModelFromEnv } from '@/db/embedding-config';

describe('resolveEmbeddingModelFromEnv', () => {
  it('returns null when EMBEDDING_MODEL is missing or blank', () => {
    expect(resolveEmbeddingModelFromEnv({})).toBeNull();
    expect(resolveEmbeddingModelFromEnv({ EMBEDDING_MODEL: '' })).toBeNull();
    expect(resolveEmbeddingModelFromEnv({ EMBEDDING_MODEL: '   ' })).toBeNull();
    expect(resolveEmbeddingModelFromEnv({ EMBEDDING_MODEL: undefined })).toBeNull();
  });

  it('treats commented values as not configured', () => {
    expect(resolveEmbeddingModelFromEnv({ EMBEDDING_MODEL: '# diisi nanti' })).toBeNull();
  });

  it('trims and returns the configured model', () => {
    expect(resolveEmbeddingModelFromEnv({ EMBEDDING_MODEL: ' vendor/model-name ' })).toBe(
      'vendor/model-name',
    );
  });
});

describe('buildEmbeddingTaskConfigRow', () => {
  it('builds the placeholder ai_task_configs row for the embedding task', () => {
    expect(buildEmbeddingTaskConfigRow('vendor/model-name')).toEqual({
      task: 'embedding',
      model: 'vendor/model-name',
      temperature: 0,
      maxOutputTokens: 1,
      isActive: true,
    });
  });
});
