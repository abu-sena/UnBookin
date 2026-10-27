import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerOption } from '@/components/module/quiz/answer-option';
import { renderWithIntl } from './render';

afterEach(cleanup);

describe('AnswerOption', () => {
  it('exposes selection and default state to assistive technology', () => {
    renderWithIntl(
      <AnswerOption index={0} label="Menyusun sistem kerja" state="default" onSelect={() => undefined} />,
    );

    const option = screen.getByRole('radio', { name: /Pilihan A/ });
    expect(option).toHaveAttribute('aria-checked', 'false');
    expect(option).toHaveTextContent('Menyusun sistem kerja');
  });

  it('shows correctness with an icon, text and aria label', () => {
    renderWithIntl(
      <div>
        <AnswerOption index={1} label="Membangun sistem" state="correct" disabled />
        <AnswerOption index={2} label="Mencari panggung" state="incorrect" disabled />
      </div>,
    );

    const correct = screen.getByRole('radio', { name: /Membangun sistem/ });
    expect(correct).toHaveAttribute('aria-checked', 'true');
    expect(correct).toHaveAccessibleName(/Jawaban benar/);
    expect(screen.getByText('Jawaban benar')).toBeInTheDocument();

    const incorrect = screen.getByRole('radio', { name: /Mencari panggung/ });
    expect(incorrect).toHaveAccessibleName(/Jawaban salah/);
    expect(screen.getByText('Jawaban salah')).toBeInTheDocument();
  });

  it('uses checkbox semantics for multi-select questions and reports taps', () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <AnswerOption index={0} label="Pilihan ganda" state="default" multi onSelect={onSelect} />,
    );

    const option = screen.getByRole('checkbox', { name: /Pilihan A/ });
    expect(option).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
