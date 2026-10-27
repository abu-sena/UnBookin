import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningError } from '@/lib/learning/errors';
import { MODULE_ID, OTHER_UNBOOK_ID, UNBOOK_ID, USER_ID, sampleContent } from './fixtures';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(),
  getModuleForReading: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/lib/learning/queries', () => ({
  getModuleForReading: mocks.getModuleForReading,
}));

import { loadReaderModule, type ReaderModuleData } from '@/components/reader/module-page-data';

const identity = { userId: USER_ID };

function moduleData(overrides: Partial<ReaderModuleData> = {}): ReaderModuleData {
  return {
    moduleId: MODULE_ID,
    unbookId: UNBOOK_ID,
    title: 'Pemimpin membangun sistem',
    content: sampleContent,
    status: 'not_started',
    deepestLayer: 'eli5',
    checklist: {},
    quizId: null,
    quizQuestionCount: 0,
    reviewCardCount: 0,
    plannedActionId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.notFound.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
});

describe('loadReaderModule', () => {
  it('returns a module that belongs to the Unbook in the URL', async () => {
    mocks.getModuleForReading.mockResolvedValue(moduleData());

    const result = await loadReaderModule(identity, UNBOOK_ID, MODULE_ID);

    expect(mocks.getModuleForReading).toHaveBeenCalledWith(identity, { moduleId: MODULE_ID });
    expect(result.moduleId).toBe(MODULE_ID);
    expect(result.content.bigIdea).toBe(sampleContent.bigIdea);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('calls notFound for a module that belongs to another Unbook', async () => {
    mocks.getModuleForReading.mockResolvedValue(moduleData({ unbookId: OTHER_UNBOOK_ID }));

    await expect(loadReaderModule(identity, UNBOOK_ID, MODULE_ID)).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it('maps a missing module to notFound instead of a server error', async () => {
    mocks.getModuleForReading.mockRejectedValue(new LearningError('notFound'));

    await expect(loadReaderModule(identity, UNBOOK_ID, MODULE_ID)).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
});
