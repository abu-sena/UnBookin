import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { loadPersona, resolvePersonaSlug } from '@/lib/ai/personas';

describe('persona whitelist', () => {
  it('resolves known interest slugs', async () => {
    const leadership = await loadPersona('leadership-management');
    expect(leadership.slug).toBe('leadership-management');
    expect(leadership.name).toBe('Mentor Kepemimpinan');
    expect(leadership.content).toContain('Mentor Kepemimpinan');

    const islamic = await loadPersona('islamic-studies');
    expect(islamic.name).toBe('Mentor Studi Islam');
    expect(islamic.content).toContain('fatwa');
    expect(islamic.content).toContain('ulama');
  });

  it('falls back to the general persona for unknown or traversal slugs', async () => {
    expect(resolvePersonaSlug('../general')).toBe('general');
    expect(resolvePersonaSlug('../../etc/passwd')).toBe('general');
    for (const slug of ['../general', '../../etc/passwd', 'unknown-interest']) {
      const persona = await loadPersona(slug);
      expect(persona.slug).toBe('general');
      expect(persona.name).toBe('Mentor Unbookin');
    }
  });

  it('caches loaded personas in memory', async () => {
    const first = await loadPersona('general');
    const second = await loadPersona('general');
    expect(second).toBe(first);
  });
});
