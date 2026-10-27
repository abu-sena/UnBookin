import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlipCard, ReviewRatingBar } from '@/components/module/flip-card';
import { renderWithIntl } from './render';

afterEach(cleanup);

function ReviewCardDemo({ onRate }: { onRate?: (rating: string) => void }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div>
      <FlipCard
        front="Apa inti dari sistem, bukan panggung?"
        back="Pemimpin membangun cara kerja yang bertahan tanpa dirinya."
        flipped={flipped}
        onFlip={() => setFlipped((current) => !current)}
      />
      <ReviewRatingBar
        disabled={!flipped}
        onRate={(rating) => onRate?.(rating)}
      />
    </div>
  );
}

describe('FlipCard', () => {
  it('flips on tap and announces the back side', () => {
    renderWithIntl(<ReviewCardDemo />);

    const card = screen.getByRole('button', { name: /Apa inti dari sistem/ });
    expect(card).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(card);

    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Jawaban: Pemimpin membangun cara kerja yang bertahan tanpa dirinya.',
    );
  });

  it('disables the rating buttons until the card is flipped', () => {
    const onRate = vi.fn();
    renderWithIntl(<ReviewCardDemo onRate={onRate} />);

    expect(screen.getByRole('button', { name: 'Lupa' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ragu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ingat' })).toBeDisabled();
    expect(screen.getByText('Balik kartu dulu untuk menilai.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Apa inti dari sistem/ }));

    const good = screen.getByRole('button', { name: 'Ingat' });
    expect(good).toBeEnabled();
    fireEvent.click(good);
    expect(onRate).toHaveBeenCalledWith('good');
  });
});
