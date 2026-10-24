import { describe, expect, it } from 'vitest';
import { formatIdr } from '@/lib/format';

describe('formatIdr', () => {
  it('formats 59000 as "Rp 59.000"', () => {
    expect(formatIdr(59000)).toBe('Rp 59.000');
  });

  it('formats 0 without decimals', () => {
    expect(formatIdr(0)).toBe('Rp 0');
  });

  it('normalises the no-break space Intl may emit after the symbol', () => {
    expect(formatIdr(449000)).not.toMatch(/[\u00a0\u202f]/);
    expect(formatIdr(449000)).toBe('Rp 449.000');
  });
});
