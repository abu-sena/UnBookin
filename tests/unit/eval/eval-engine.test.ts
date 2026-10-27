import { describe, expect, it } from 'vitest';

import {
  isProductionDatabaseUrl,
  parseEvalArgs,
  requireDatabaseUrl,
} from '../../../scripts/eval-engine';

const LOCAL = 'postgres://unbookin:unbookin@127.0.0.1:5432/unbookin_m3_test_20261027';

describe('eval argument parsing', () => {
  it('defaults to real mode with every fixture', () => {
    expect(parseEvalArgs([])).toEqual({ fake: false, only: null });
  });

  it('accepts --fake and both --only forms', () => {
    expect(parseEvalArgs(['--fake'])).toEqual({ fake: true, only: null });
    expect(parseEvalArgs(['--only=pdf'])).toEqual({ fake: false, only: 'pdf' });
    expect(parseEvalArgs(['--fake', '--only', 'epub'])).toEqual({
      fake: true,
      only: 'epub',
    });
  });

  it('rejects unknown flags and a missing --only value', () => {
    expect(() => parseEvalArgs(['--real'])).toThrow('Unknown argument');
    expect(() => parseEvalArgs(['--only'])).toThrow('--only requires a fixture name');
    expect(() => parseEvalArgs(['--only='])).toThrow('--only requires a fixture name');
    expect(() => parseEvalArgs(['--only', '--fake'])).toThrow('--only requires a fixture name');
  });
});

describe('production database guard', () => {
  it.each([
    'postgres://user:pass@ep-example.us-east-2.aws.neon.tech/db',
    'postgres://user:pass@NEON.TECH/db',
    'postgres://user:pass@vercel-db.internal/db',
  ])('flags %s as production-like', (url) => {
    expect(isProductionDatabaseUrl(url)).toBe(true);
  });

  it('accepts the isolated local database', () => {
    expect(isProductionDatabaseUrl(LOCAL)).toBe(false);
    expect(requireDatabaseUrl(LOCAL)).toBe(LOCAL);
  });

  it('refuses a missing or production-like DATABASE_URL', () => {
    expect(() => requireDatabaseUrl(undefined)).toThrow('DATABASE_URL is required');
    expect(() => requireDatabaseUrl('  ')).toThrow('DATABASE_URL is required');
    expect(() => requireDatabaseUrl('postgres://u:p@x.neon.tech/db')).toThrow(
      'Neon/Vercel production host',
    );
  });
});
