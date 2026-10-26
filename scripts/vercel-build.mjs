// Vercel build entry (vercel.json → buildCommand). Approved by the founder on 2026-10-26.
// Production builds apply pending Drizzle migrations to Neon before `next build`; set RUN_SEED=1 for one
// deploy to also run the idempotent seed. Preview builds never touch the database: they share the
// production Neon branch, so migrations from unmerged branches must not run there.
import { execSync } from 'node:child_process';

function run(command, extraEnv = {}) {
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...extraEnv } });
}

if (process.env.VERCEL_ENV === 'production') {
  // Direct (non-pooled) connection: migrations need a session, not the PgBouncer transaction pool.
  const migrationUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!migrationUrl) {
    console.error(
      'DATABASE_URL_UNPOOLED is missing; refusing to build without applying migrations.',
    );
    process.exit(1);
  }
  console.log('Applying database migrations…');
  run('pnpm db:migrate', { DATABASE_URL: migrationUrl });
  if (process.env.RUN_SEED === '1') {
    console.log('RUN_SEED=1: seeding reference data…');
    run('pnpm db:seed', { DATABASE_URL: migrationUrl });
  }
} else {
  console.log(`VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}: skipping migrations.`);
}

run('pnpm build');
