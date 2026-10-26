import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { BadgeRule } from '../lib/game/badge-rules';
import { PlanLimits } from '../lib/billing/plan-limits';
import {
  aiTaskConfigs,
  badges,
  domains,
  interests,
  missionTemplates,
  plans,
  priceVariants,
} from './schema';
import {
  badgeSeeds,
  domainSeeds,
  interestSeeds,
  missionSeeds,
  planSeeds,
  priceVariantSeeds,
} from './seed-data';
import { buildEmbeddingTaskConfigRow, resolveEmbeddingModelFromEnv } from './embedding-config';

config({ path: ['.env.local', '.env'], quiet: true });

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to seed the database.');
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { casing: 'snake_case' });
  try {
    await db.transaction(async (tx) => {
      const interestIds = new Map<string, string>();
      for (const row of interestSeeds) {
        const [interest] = await tx
          .insert(interests)
          .values(row)
          .onConflictDoUpdate({ target: interests.slug, set: row })
          .returning({ id: interests.id });
        if (!interest) throw new Error('Interest seed returned no row.');
        interestIds.set(row.slug, interest.id);
      }
      for (const [sortOrder, row] of domainSeeds.entries()) {
        const interestId = interestIds.get(row.interestSlug);
        if (!interestId) throw new Error(`Missing seed interest: ${row.interestSlug}`);
        const data = { interestId, slug: row.slug, name: row.name, sortOrder };
        await tx
          .insert(domains)
          .values(data)
          .onConflictDoUpdate({ target: [domains.interestId, domains.slug], set: data });
      }
      for (const row of planSeeds) {
        const data = { ...row, limits: PlanLimits.parse(row.limits) };
        await tx.insert(plans).values(data).onConflictDoUpdate({ target: plans.code, set: data });
      }
      for (const row of priceVariantSeeds) {
        await tx
          .insert(priceVariants)
          .values(row)
          .onConflictDoUpdate({
            target: [priceVariants.variant, priceVariants.planCode],
            set: row,
          });
      }
      for (const row of badgeSeeds) {
        const data = { ...row, rule: BadgeRule.parse(row.rule) };
        await tx.insert(badges).values(data).onConflictDoUpdate({ target: badges.slug, set: data });
      }
      for (const row of missionSeeds) {
        await tx
          .insert(missionTemplates)
          .values(row)
          .onConflictDoUpdate({ target: missionTemplates.slug, set: row });
      }
      // Optional embedding model config: only seeded when EMBEDDING_MODEL is
      // set to a non-empty, non-comment value. All other seed data is
      // preserved either way.
      const embeddingModel = resolveEmbeddingModelFromEnv(process.env);
      if (embeddingModel) {
        const row = buildEmbeddingTaskConfigRow(embeddingModel);
        await tx
          .insert(aiTaskConfigs)
          .values(row)
          .onConflictDoUpdate({ target: aiTaskConfigs.task, set: row });
      }
    });
    console.info(
      resolveEmbeddingModelFromEnv(process.env)
        ? 'Seed complete: interests, domains, plans, badges, mission templates, embedding config.'
        : 'Seed complete: interests, domains, plans, badges, mission templates (no EMBEDDING_MODEL configured).',
    );
  } finally {
    await client.end();
  }
}

seed().catch(() => {
  // Do not print driver errors: connection strings can contain credentials.
  console.error('Database seed failed. Check database connectivity and migrations.');
  process.exitCode = 1;
});
