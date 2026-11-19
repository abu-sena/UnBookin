import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { codeChallengeS256, createCodeVerifier, createState } from '@/lib/byok/pkce';

describe('PKCE S256', () => {
  it('matches the RFC 7636 appendix B test vector', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(codeChallengeS256(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('creates a 43–128 character verifier and high-entropy state', () => {
    const verifier = createCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(createState()).not.toBe(createState());
  });
});
