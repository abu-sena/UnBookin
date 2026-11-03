import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Persona files follow the SOUL.md pattern. Only this fixed whitelist selects a
 * file: no part of the caller's input ever reaches a filesystem path.
 */
const PERSONAS = {
  'leadership-management': {
    file: 'leadership-management.md',
    name: 'Mentor Kepemimpinan',
    fallback: 'Anda adalah Mentor Kepemimpinan di Unbookin.',
  },
  'personal-development-productivity': {
    file: 'personal-development-productivity.md',
    name: 'Mentor Pengembangan Diri',
    fallback: 'Anda adalah Mentor Pengembangan Diri di Unbookin.',
  },
  'islamic-studies': {
    file: 'islamic-studies.md',
    name: 'Mentor Studi Islam',
    fallback: 'Anda adalah Mentor Studi Islam di Unbookin. Jangan mengeluarkan fatwa.',
  },
  general: {
    file: 'general.md',
    name: 'Mentor Unbookin',
    fallback: 'Anda adalah Mentor Unbookin.',
  },
} as const;

export type PersonaSlug = keyof typeof PERSONAS;

export interface Persona {
  slug: PersonaSlug;
  name: string;
  content: string;
}

const cache = new Map<PersonaSlug, Persona>();

/** Unknown slugs, including traversal attempts, always resolve to `general`. */
export function resolvePersonaSlug(slug: string): PersonaSlug {
  return Object.prototype.hasOwnProperty.call(PERSONAS, slug) ? (slug as PersonaSlug) : 'general';
}

export async function loadPersona(slug: string): Promise<Persona> {
  const key = resolvePersonaSlug(slug);
  const cached = cache.get(key);
  if (cached) return cached;

  const config = PERSONAS[key];
  const filePath = path.join(process.cwd(), 'src', 'lib', 'ai', 'personas', config.file);
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    // A missing file must not break chat; the built-in line keeps the boundary.
    content = config.fallback;
  }
  const persona: Persona = { slug: key, name: config.name, content };
  cache.set(key, persona);
  return persona;
}
