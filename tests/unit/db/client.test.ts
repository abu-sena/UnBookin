import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('database initialization', () => {
  it('imports without DATABASE_URL but fails clearly on first use', async () => {
    vi.stubEnv('DATABASE_URL', undefined);
    const { db } = await import('../../../src/db');
    expect(() => db.select()).toThrow('DATABASE_URL is required before using the database.');
  });
});
