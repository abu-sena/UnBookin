import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/id.json';
import type { QuizFlowProps, QuizQuestionView } from '@/components/quiz-flow/types';
import { QuizFlow } from '@/components/quiz-flow/quiz-flow';

const mocks = vi.hoisted(() => ({
  resume: vi.fn(),
  grade: vi.fn(),
  finish: vi.fn(),
  retry: vi.fn(),
  record: vi.fn(),
  selfGrade: vi.fn(),
  excerpt: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/learning/quiz-actions', () => ({
  resumeQuizAttempt: mocks.resume,
  gradeShortAnswer: mocks.grade,
  finishQuizAndPrepareRetry: mocks.finish,
  startQuizForModule: mocks.retry,
}));
vi.mock('@/lib/learning/actions', () => ({
  recordQuizAnswer: mocks.record,
  recordShortAnswerGrade: mocks.selfGrade,
  getSourceExcerpt: mocks.excerpt,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

const QUESTIONS: QuizQuestionView[] = [
  { id: 'q1', type: 'mcq', prompt: 'Soal satu', options: ['Opsi satu', 'Opsi dua'] },
  { id: 'q2', type: 'mcq', prompt: 'Soal dua', options: ['Opsi tiga', 'Opsi empat'] },
];
const SHORT: QuizQuestionView[] = [
  { id: 'q3', type: 'short_answer', prompt: 'Jelaskan singkat', options: null },
];
const PROPS: QuizFlowProps = {
  unbookId: 'unbook-1',
  moduleId: 'module-1',
  moduleTitle: 'Modul',
  quizId: 'quiz-1',
  questions: QUESTIONS,
  concepts: [{ concept: 'Pemilik keputusan', chunkRefs: ['chunk-1'] }],
  nextModule: { moduleId: 'module-2', title: 'Modul dua' },
};

function renderFlow(overrides: Partial<QuizFlowProps> = {}) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <QuizFlow {...PROPS} {...overrides} />
    </NextIntlClientProvider>,
  );
}

function resumeWith(questions: QuizQuestionView[]) {
  mocks.resume.mockResolvedValue({
    ok: true,
    attemptId: 'attempt-1',
    quizId: 'quiz-1',
    questions,
    answeredQuestionIds: [],
    resumed: false,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  resumeWith(QUESTIONS);
  mocks.record.mockResolvedValue({
    ok: true,
    kind: 'graded',
    correct: true,
    explanation: 'Pembahasan soal.',
    chunkRefs: [],
    correctAnswer: 0,
  });
  mocks.finish.mockResolvedValue({
    ok: true,
    scorePct: 100,
    passed: true,
    xpAwarded: true,
    weakConcepts: { chunkIds: [], bloomLevels: [] },
    retryVersionQueued: false,
  });
});

afterEach(cleanup);

describe('QuizFlow choices', () => {
  it('shows one question per screen, immediate feedback, then the pass screen', async () => {
    renderFlow();
    expect(await screen.findByText('Soal satu')).toBeInTheDocument();
    expect(screen.queryByText('Soal dua')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Opsi satu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));

    expect(await screen.findByText('Pembahasan soal.')).toBeInTheDocument();
    expect(mocks.record).toHaveBeenCalledWith({
      attemptId: 'attempt-1',
      questionId: 'q1',
      answer: { index: 0 },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(screen.getByText('Soal dua')).toBeInTheDocument();
    expect(screen.queryByText('Soal satu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Opsi tiga/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));
    expect(await screen.findByText('Pembahasan soal.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lihat hasil' }));
    expect(await screen.findByText('Selamat, kamu lulus!')).toBeInTheDocument();
    expect(screen.getByText('+40 XP')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kembali ke modul' })).toHaveAttribute(
      'href',
      '/unbook/unbook-1/module/module-1',
    );
    expect(screen.getByRole('link', { name: 'Modul berikutnya' })).toHaveAttribute(
      'href',
      '/unbook/unbook-1/module/module-2',
    );
    expect(mocks.finish).toHaveBeenCalledWith({ attemptId: 'attempt-1' });
  });
});

describe('QuizFlow short answers', () => {
  it('grades with AI and shows the feedback', async () => {
    resumeWith(SHORT);
    mocks.record.mockResolvedValue({
      ok: true,
      kind: 'selfGraded',
      needsGrading: true,
      modelAnswer: 'Jawaban model',
      rubric: ['1', '2', '3', '4'],
    });
    mocks.grade.mockResolvedValue({
      ok: true,
      grade: 4,
      correct: true,
      feedback: 'Jawabanmu lengkap dan tepat.',
    });
    renderFlow();

    expect(await screen.findByText('Jelaskan singkat')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Jawabanmu'), { target: { value: 'Jawaban saya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));

    expect(await screen.findByText('Jawabanmu lengkap dan tepat.')).toBeInTheDocument();
    expect(mocks.record).toHaveBeenCalledWith({
      attemptId: 'attempt-1',
      questionId: 'q3',
      answer: 'Jawaban saya',
    });
    expect(mocks.grade).toHaveBeenCalledWith({ attemptId: 'attempt-1', questionId: 'q3' });

    fireEvent.click(screen.getByRole('button', { name: 'Lihat hasil' }));
    expect(await screen.findByText('Selamat, kamu lulus!')).toBeInTheDocument();
  });

  it('falls back to self-grading when the AI grader is unavailable', async () => {
    resumeWith(SHORT);
    mocks.record.mockResolvedValue({
      ok: true,
      kind: 'selfGraded',
      needsGrading: true,
      modelAnswer: 'Jawaban model',
      rubric: ['1', '2', '3', '4'],
    });
    mocks.grade.mockResolvedValue({ ok: false, code: 'gradingUnavailable' });
    mocks.selfGrade.mockResolvedValue({ ok: true, graded: true });
    renderFlow();

    expect(await screen.findByText('Jelaskan singkat')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Jawabanmu'), { target: { value: 'Jawaban saya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));

    expect((await screen.findAllByText('Jawaban model')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sudah sesuai' }));

    expect(await screen.findByText(/Bagus, jawabanmu sudah sesuai/)).toBeInTheDocument();
    expect(mocks.selfGrade).toHaveBeenCalledWith({
      attemptId: 'attempt-1',
      questionId: 'q3',
      grade: { selfGraded: true, correct: true },
    });
  });
});

describe('QuizFlow failure and retry', () => {
  it('shows "Hampir!", maps weak concepts, and retries the active quiz', async () => {
    resumeWith([QUESTIONS[0]!]);
    mocks.record.mockResolvedValue({
      ok: true,
      kind: 'graded',
      correct: false,
      explanation: 'Belum tepat.',
      chunkRefs: [],
      correctAnswer: 1,
    });
    mocks.finish.mockResolvedValue({
      ok: true,
      scorePct: 50,
      passed: false,
      xpAwarded: false,
      weakConcepts: { chunkIds: ['chunk-1'], bloomLevels: ['apply'] },
      retryVersionQueued: true,
    });
    mocks.retry.mockResolvedValue({
      ok: true,
      attemptId: 'attempt-2',
      quizId: 'quiz-2',
      questions: [{ id: 'q9', type: 'mcq', prompt: 'Soal versi baru', options: ['A', 'B'] }],
      answeredQuestionIds: [],
      resumed: false,
    });
    renderFlow({ questions: [QUESTIONS[0]!] });

    expect(await screen.findByText('Soal satu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Opsi satu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Periksa' }));
    expect(await screen.findByText('Belum tepat.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lihat hasil' }));

    expect(await screen.findByText('Hampir!')).toBeInTheDocument();
    expect(screen.getByText('Pemilik keputusan')).toBeInTheDocument();
    expect(screen.getByText(/Soal versi baru sedang disiapkan/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pelajari ulang' }));
    expect(mocks.push).toHaveBeenCalledWith('/unbook/unbook-1/module/module-1?layer=practitioner');

    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText('Soal versi baru')).toBeInTheDocument();
    expect(mocks.retry).toHaveBeenCalledWith({ moduleId: 'module-1' });
    await waitFor(() => expect(screen.queryByText('Hampir!')).not.toBeInTheDocument());
  });
});
