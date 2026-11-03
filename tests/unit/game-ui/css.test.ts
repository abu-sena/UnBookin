import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app/globals.css', 'utf8');

describe('game motion CSS', () => {
  it('fades the XP toast out within 1.2 seconds', () => {
    expect(css).toMatch(/@keyframes xp-toast-rise[\s\S]*?100%\s*\{[^}]*opacity:\s*0/);
    expect(css).toMatch(/\.xp-toast-motion\s*\{[^}]*animation:\s*xp-toast-rise 1\.2s/);
  });

  it('disables toast, flame and confetti under reduced motion', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toContain('.xp-toast-motion');
    expect(block).toContain('.streak-flame-motion');
    expect(block).toMatch(/\.confetti-piece\s*\{[^}]*display:\s*none/);
  });

  it('defines readable text tokens for every Dreyfus level in both themes', () => {
    for (const level of ['novice', 'advanced-beginner', 'competent', 'proficient', 'expert']) {
      expect(css.match(new RegExp(`--level-${level}-text:`, 'g'))).toHaveLength(2);
      expect(css).toContain(`--color-level-${level}-text:`);
    }
  });
});
