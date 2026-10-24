import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HeroContent } from '@/components/marketing/hero';

afterEach(cleanup);

describe('HeroContent', () => {
  it('renders the CTA as an anchor to #daftar', () => {
    render(
      <HeroContent
        tagline="Unbook anything. Master everything."
        description="Ubah bacaan jadi modul."
        ctaLabel="Gabung daftar tunggu"
      />,
    );

    const cta = screen.getByRole('link', { name: 'Gabung daftar tunggu' });
    expect(cta).toHaveAttribute('href', '#daftar');
  });

  it('renders exactly one h1 with the tagline', () => {
    render(
      <HeroContent
        tagline="Unbook anything. Master everything."
        description="Ubah bacaan jadi modul."
        ctaLabel="Gabung daftar tunggu"
      />,
    );

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Unbook anything. Master everything.');
  });
});
