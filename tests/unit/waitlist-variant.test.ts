import { describe, expect, it } from 'vitest';
import { parsePriceVariant, pickPriceVariant } from '@/lib/waitlist/variant';

describe('price variant', () => {
  it('parses only A or B', () => {
    expect(parsePriceVariant('A')).toBe('A');
    expect(parsePriceVariant('B')).toBe('B');
    expect(parsePriceVariant('C')).toBeNull();
    expect(parsePriceVariant(undefined)).toBeNull();
  });
  it('splits randomly at 50%', () => {
    expect(pickPriceVariant(() => 0.49)).toBe('A');
    expect(pickPriceVariant(() => 0.5)).toBe('B');
  });
});
