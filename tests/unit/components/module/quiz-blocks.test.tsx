import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerFeedback } from '@/components/module/quiz/answer-feedback';
import { QuizProgress } from '@/components/module/quiz/quiz-progress';
import { QuizResultPanel } from '@/components/module/quiz/quiz-result-panel';
import { SelfGradePanel } from '@/components/module/quiz/self-grade-panel';
import { ShortAnswerField } from '@/components/module/quiz/short-answer-field';
import { renderWithIntl } from './render';

afterEach(cleanup);

describe('QuizProgress', () => {
  it('shows the question counter and clamps the percentage', () => {
    renderWithIntl(<QuizProgress current={3} total={8} />);

    expect(screen.getByText('Soal 3 dari 8')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progres kuis: soal 3 dari 8' })).toHaveAttribute(
      'aria-valuenow',
      '38',
    );
  });
});

describe('AnswerFeedback', () => {
  it('never shames a wrong answer and keeps the source slot', () => {
    renderWithIntl(
      <AnswerFeedback
        correct={false}
        explanation="Sistem kerja lebih penting daripada panggung."
        sourceSlot={<span>hlm. 42</span>}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Belum tepat. Ini alasannya…');
    expect(screen.getByText('Sistem kerja lebih penting daripada panggung.')).toBeInTheDocument();
    expect(screen.getByText('Lihat di sumber')).toBeInTheDocument();
  });
});

describe('ShortAnswerField', () => {
  it('counts characters and reports changes', () => {
    const onValueChange = vi.fn();
    renderWithIntl(<ShortAnswerField value="Halo" onValueChange={onValueChange} maxLength={280} />);

    expect(screen.getByText('4/280 karakter')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Jawabanmu'), { target: { value: 'Halo dunia' } });
    expect(onValueChange).toHaveBeenCalledWith('Halo dunia');
  });
});

describe('SelfGradePanel', () => {
  it('shows the model answer and the four-point rubric, then grades', () => {
    const onGrade = vi.fn();
    renderWithIntl(<SelfGradePanel modelAnswer="Jawaban model." onGrade={onGrade} />);

    expect(screen.getByText('Jawaban model.')).toBeInTheDocument();
    expect(screen.getByText('1 — Belum menjawab inti')).toBeInTheDocument();
    expect(screen.getByText('4 — Sesuai dan memberi contoh tambahan')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sudah sesuai' }));
    expect(onGrade).toHaveBeenCalledWith(true);
  });
});

describe('QuizResultPanel', () => {
  it('celebrates a pass with the score and XP slot', () => {
    renderWithIntl(<QuizResultPanel passed score={90} xpSlot={<span>+30 XP</span>} />);

    expect(screen.getByText('Selamat, kamu lulus!')).toBeInTheDocument();
    expect(screen.getByText('Nilai kamu 90%')).toBeInTheDocument();
    expect(screen.getByText('+30 XP')).toBeInTheDocument();
  });

  it('offers relearn and retry with the weak concepts after a fail', () => {
    const onRelearn = vi.fn();
    const onRetry = vi.fn();
    renderWithIntl(
      <QuizResultPanel
        passed={false}
        score={60}
        weakConcepts={['Pemilik keputusan']}
        onRelearn={onRelearn}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Hampir!')).toBeInTheDocument();
    expect(screen.getByText('Pemilik keputusan')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pelajari ulang' }));
    expect(onRelearn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
