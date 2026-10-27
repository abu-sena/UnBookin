import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  gradeService: vi.fn(),
  finishStore: vi.fn(),
  startStore: vi.fn(),
  status: vi.fn(),
  quizForAttempt: vi.fn(),
  moduleForReading: vi.fn(),
  queue: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/learning/grading', () => ({ gradeShortAnswer: mocks.gradeService }));
vi.mock('@/lib/learning/store', () => ({
  finishQuizAttempt: mocks.finishStore,
  startQuizAttempt: mocks.startStore,
}));
vi.mock('@/lib/learning/queries', () => ({
  getAttemptStatus: mocks.status,
  getQuizForAttempt: mocks.quizForAttempt,
  getModuleForReading: mocks.moduleForReading,
}));
vi.mock('@/lib/generation/quiz-version', () => ({ queueQuizVersion: mocks.queue }));

import { LearningError } from '@/lib/learning/errors';
import {
  finishQuizAndPrepareRetry,
  gradeShortAnswer,
  resumeQuizAttempt,
  startQuizForModule,
} from '@/lib/learning/quiz-actions';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const ATTEMPT_ID = 'd4e5f6a7-8c9d-4eaf-b01f-3b4c5d6e7f8a';
const QUESTION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const QUIZ_ID = 'c3d4e5f6-7b8c-4d9e-af0f-2a3b4c5d6e7f';
const MODULE_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: USER_ID });
  mocks.status.mockResolvedValue({ moduleId: MODULE_ID, answeredQuestionIds: ['q0'] });
  mocks.startStore.mockResolvedValue({ attemptId: ATTEMPT_ID, resumed: false });
  mocks.quizForAttempt.mockResolvedValue({
    quizId: QUIZ_ID,
    moduleId: MODULE_ID,
    questions: [{ id: 'q1', type: 'mcq', prompt: 'Soal', options: ['A', 'B'] }],
  });
  mocks.moduleForReading.mockResolvedValue({ quizId: QUIZ_ID });
});

describe('gradeShortAnswer action', () => {
  it('rejects malformed input before touching the grader', async () => {
    const result = await gradeShortAnswer({ attemptId: 'not-a-uuid', questionId: QUESTION_ID });
    expect(result).toEqual({ ok: false, code: 'invalidInput' });
    expect(mocks.gradeService).not.toHaveBeenCalled();
  });

  it('maps AI/config failures to gradingUnavailable so the UI can self-grade', async () => {
    mocks.gradeService.mockRejectedValue(new LearningError('gradingUnavailable'));
    const result = await gradeShortAnswer({ attemptId: ATTEMPT_ID, questionId: QUESTION_ID });
    expect(result).toEqual({ ok: false, code: 'gradingUnavailable' });

    mocks.gradeService.mockRejectedValue(new LearningError('notFound'));
    const missing = await gradeShortAnswer({ attemptId: ATTEMPT_ID, questionId: QUESTION_ID });
    expect(missing).toEqual({ ok: false, code: 'gradingUnavailable' });
  });

  it('returns the grade and feedback untouched', async () => {
    mocks.gradeService.mockResolvedValue({ grade: 4, correct: true, feedback: 'Mantap.' });
    const result = await gradeShortAnswer({ attemptId: ATTEMPT_ID, questionId: QUESTION_ID });
    expect(result).toEqual({ ok: true, grade: 4, correct: true, feedback: 'Mantap.' });
    expect(mocks.gradeService).toHaveBeenCalledWith(
      { userId: USER_ID },
      { attemptId: ATTEMPT_ID, questionId: QUESTION_ID },
    );
  });
});

describe('finishQuizAndPrepareRetry action', () => {
  const finished = {
    scorePct: 60,
    passed: false,
    xpAwarded: false,
    weakConcepts: { chunkIds: ['chunk-1'], bloomLevels: ['apply'] },
  };

  it('rejects malformed input before finishing', async () => {
    const result = await finishQuizAndPrepareRetry({ attemptId: 'nope' });
    expect(result).toEqual({ ok: false, code: 'invalidInput' });
    expect(mocks.finishStore).not.toHaveBeenCalled();
  });

  it('does not queue a new version after a pass', async () => {
    mocks.finishStore.mockResolvedValue({ ...finished, passed: true, scorePct: 90 });
    const result = await finishQuizAndPrepareRetry({ attemptId: ATTEMPT_ID });
    expect(result).toMatchObject({ ok: true, passed: true, retryVersionQueued: false });
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it('queues version n+1 after a fail and returns the flag', async () => {
    mocks.finishStore.mockResolvedValue(finished);
    mocks.queue.mockResolvedValue({ queued: true, versionCount: 1 });
    const result = await finishQuizAndPrepareRetry({ attemptId: ATTEMPT_ID });
    expect(result).toMatchObject({ ok: true, passed: false, retryVersionQueued: true });
    expect(mocks.queue).toHaveBeenCalledWith({ userId: USER_ID }, MODULE_ID);
  });

  it('never breaks the result when queueing fails', async () => {
    mocks.finishStore.mockResolvedValue(finished);
    mocks.queue.mockRejectedValue(new Error('queue down'));
    const result = await finishQuizAndPrepareRetry({ attemptId: ATTEMPT_ID });
    expect(result).toMatchObject({ ok: true, retryVersionQueued: false });
  });
});

describe('quiz loading actions', () => {
  it('resumes an attempt with its unanswered progress and answer-free questions', async () => {
    const result = await resumeQuizAttempt({ quizId: QUIZ_ID });
    expect(result).toMatchObject({
      ok: true,
      attemptId: ATTEMPT_ID,
      quizId: QUIZ_ID,
      answeredQuestionIds: ['q0'],
    });
    expect(mocks.quizForAttempt).toHaveBeenCalledWith({ userId: USER_ID }, { quizId: QUIZ_ID });
  });

  it('rejects a malformed quiz id', async () => {
    expect(await resumeQuizAttempt({ quizId: 'nope' })).toEqual({
      ok: false,
      code: 'invalidInput',
    });
    expect(mocks.startStore).not.toHaveBeenCalled();
  });

  it('starts the module CURRENT active quiz on retry', async () => {
    const result = await startQuizForModule({ moduleId: MODULE_ID });
    expect(result).toMatchObject({ ok: true, quizId: QUIZ_ID });
    expect(mocks.startStore).toHaveBeenCalledWith({ userId: USER_ID }, { quizId: QUIZ_ID });
  });
});
