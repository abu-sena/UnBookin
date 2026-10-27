import { render } from '@testing-library/react';
import { moduleResult } from '../generation/fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  requireUser: vi.fn(),
  getModuleForReading: vi.fn(),
  getQuizForAttempt: vi.fn(),
  getUnbookPath: vi.fn(),
  quizFlowProps: [] as Record<string, unknown>[],
}));

vi.mock('next-intl/server', () => ({ getTranslations: mocks.getTranslations }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/lib/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/learning/queries', () => ({
  getModuleForReading: mocks.getModuleForReading,
  getQuizForAttempt: mocks.getQuizForAttempt,
  getUnbookPath: mocks.getUnbookPath,
}));
vi.mock('@/components/quiz-flow/quiz-flow', () => ({
  QuizFlow: (props: Record<string, unknown>) => {
    mocks.quizFlowProps.push(props);
    return null;
  },
}));

import QuizPage from '@/app/(app)/unbook/[unbookId]/module/[moduleId]/quiz/page';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const MODULE_ID = '30000000-0000-4000-8000-000000000001';
const QUIZ_ID = 'c3d4e5f6-7b8c-4d9e-af0f-2a3b4c5d6e7f';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.quizFlowProps.length = 0;
  mocks.getTranslations.mockResolvedValue((key: string) => key);
  mocks.requireUser.mockResolvedValue({ id: USER_ID });
  mocks.getModuleForReading.mockResolvedValue({
    moduleId: MODULE_ID,
    unbookId: UNBOOK_ID,
    title: 'Modul',
    content: moduleResult.content,
    quizId: QUIZ_ID,
  });
  mocks.getQuizForAttempt.mockResolvedValue({
    quizId: QUIZ_ID,
    moduleId: MODULE_ID,
    questions: [
      {
        id: 'q1',
        type: 'mcq',
        prompt: 'Soal',
        options: ['A', 'B'],
        correct: 0,
        modelAnswer: 'Jawaban model',
        rubric: ['1', '2', '3', '4'],
      },
    ],
  });
  mocks.getUnbookPath.mockResolvedValue({
    modules: [
      { moduleId: MODULE_ID, title: 'Modul' },
      { moduleId: 'module-2', title: 'Modul dua' },
    ],
  });
});

describe('quiz page props', () => {
  it('passes only answer-free question fields to the client flow', async () => {
    const page = await QuizPage({ params: Promise.resolve({ unbookId: UNBOOK_ID, moduleId: MODULE_ID }) });
    render(page);
    expect(mocks.notFound).not.toHaveBeenCalled();
    const props = mocks.quizFlowProps[0];
    expect(props).toBeDefined();
    expect(props?.nextModule).toEqual({ moduleId: 'module-2', title: 'Modul dua' });
    expect(props?.concepts).toEqual(moduleResult.content.layers.practitioner.map((concept) => ({ concept: concept.concept, chunkRefs: concept.chunkRefs })));
    const questions = props?.questions as Record<string, unknown>[];
    expect(questions).toEqual([
      { id: 'q1', type: 'mcq', prompt: 'Soal', options: ['A', 'B'] },
    ]);
    for (const question of questions) {
      expect(question).not.toHaveProperty('correct');
      expect(question).not.toHaveProperty('modelAnswer');
      expect(question).not.toHaveProperty('rubric');
    }
  });

  it('returns notFound when the module does not belong to the unbook', async () => {
    mocks.getModuleForReading.mockResolvedValue({
      moduleId: MODULE_ID,
      unbookId: 'other-unbook',
      title: 'Modul',
      content: {},
      quizId: QUIZ_ID,
    });

    await expect(
      QuizPage({ params: Promise.resolve({ unbookId: UNBOOK_ID, moduleId: MODULE_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.quizFlowProps).toHaveLength(0);
  });
});
